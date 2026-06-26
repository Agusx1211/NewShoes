#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <string>

#include "wasm_archive_probe.h"
#include "wasm_cdmanager_probe.h"
#include "wasm_globaldata_probe.h"

#include "Common/Debug.h"
#include "Common/RandomValue.h"
#include "GameLogic/LogicRandomValue.h"
#include "mmsystem.h"
#include "windows.h"
#include "wwdebug.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

namespace {
constexpr UnsignedInt ORIGINAL_CORE_PROBE_SEED = 0x12345678U;
constexpr int EMSCRIPTEN_MAIN_LOOP_FPS = 60;

bool g_booted = false;
std::uint32_t g_frame = 0;
bool g_main_loop_running = false;
std::uint32_t g_main_loop_ticks = 0;
bool g_timing_probe_ok = false;
double g_boot_time_ms = 0.0;
double g_last_tick_time_ms = 0.0;
double g_last_tick_delta_ms = 0.0;
bool g_win32_timing_probe_ok = false;
DWORD g_boot_time_get_time_ms = 0;
DWORD g_last_time_get_time_ms = 0;
DWORD g_boot_tick_count_ms = 0;
DWORD g_last_tick_count_ms = 0;
long long g_qpc_frequency = 0;
long long g_boot_qpc = 0;
long long g_last_qpc = 0;
bool g_debug_handlers_installed = false;
bool g_debug_probe_ok = false;
int g_debug_message_count = 0;
int g_debug_information_count = 0;
int g_debug_warning_count = 0;
int g_debug_error_count = 0;
int g_debug_assert_count = 0;
std::string g_debug_last_type;
std::string g_debug_last_message;
std::string g_debug_last_assert;
bool g_common_debug_log_probe_ok = false;
int g_common_debug_log_count = 0;
int g_common_debug_log_flags = 0;
std::string g_common_debug_log_last_message;
bool g_original_core_probe_ok = false;
Int g_original_logic_random_value = 0;
UnsignedInt g_original_logic_seed_crc = 0;
ArchiveProbeResult g_archive_probe;
GlobalDataProbeResult g_global_data_probe;
CommandLineProbeResult g_command_line_probe;
CDManagerProbeResult g_cd_manager_probe;
std::string g_state_json;

struct ArchiveMountState
{
	bool registered = false;
	std::string directory;
	std::string file_mask;
	int archive_count = 0;
	double total_bytes = 0.0;
	bool boot_probe_attempted = false;
	bool boot_probe_ok = false;
	std::size_t boot_probe_indexed_file_count = 0;
};

ArchiveMountState g_archive_mount;

double browser_now_ms()
{
#ifdef __EMSCRIPTEN__
	return emscripten_get_now();
#else
	return 0.0;
#endif
}

const char *debug_type_name(DebugType type)
{
	switch (type) {
		case WWDEBUG_TYPE_INFORMATION:
			return "information";
		case WWDEBUG_TYPE_WARNING:
			return "warning";
		case WWDEBUG_TYPE_ERROR:
			return "error";
		case WWDEBUG_TYPE_USER:
			return "user";
	}
	return "unknown";
}

void browser_debug_message_handler(DebugType type, const char *message)
{
	const char *type_name = debug_type_name(type);
	++g_debug_message_count;
	switch (type) {
		case WWDEBUG_TYPE_INFORMATION:
			++g_debug_information_count;
			break;
		case WWDEBUG_TYPE_WARNING:
			++g_debug_warning_count;
			break;
		case WWDEBUG_TYPE_ERROR:
			++g_debug_error_count;
			break;
		case WWDEBUG_TYPE_USER:
			break;
	}
	g_debug_last_type = type_name;
	g_debug_last_message = message != nullptr ? message : "";
	std::printf("cnc-port: wwdebug %s %s\n", type_name, g_debug_last_message.c_str());
}

void browser_debug_assert_handler(const char *message)
{
	++g_debug_assert_count;
	g_debug_last_assert = message != nullptr ? message : "";
	std::printf("cnc-port: wwdebug assert %s\n", g_debug_last_assert.c_str());
}

void install_debug_handlers()
{
	if (g_debug_handlers_installed) {
		return;
	}

	WWDebug_Install_Message_Handler(browser_debug_message_handler);
	WWDebug_Install_Assert_Handler(browser_debug_assert_handler);
	g_debug_handlers_installed = true;
}

void record_tick_time()
{
	const double now_ms = browser_now_ms();
	if (!g_timing_probe_ok) {
		g_boot_time_ms = now_ms;
		g_last_tick_delta_ms = 0.0;
	} else {
		const double delta_ms = now_ms - g_last_tick_time_ms;
		g_last_tick_delta_ms = delta_ms < 0.0 ? 0.0 : delta_ms;
	}
	g_last_tick_time_ms = now_ms;
	g_timing_probe_ok = true;

	LARGE_INTEGER qpc = {};
	LARGE_INTEGER frequency = {};
	const DWORD time_get_time_ms = timeGetTime();
	const DWORD tick_count_ms = GetTickCount();
	const bool win32_timing_ok =
		QueryPerformanceCounter(&qpc) &&
		QueryPerformanceFrequency(&frequency) &&
		frequency.QuadPart > 0;
	if (!g_win32_timing_probe_ok) {
		g_boot_time_get_time_ms = time_get_time_ms;
		g_boot_tick_count_ms = tick_count_ms;
		g_boot_qpc = qpc.QuadPart;
	}
	g_last_time_get_time_ms = time_get_time_ms;
	g_last_tick_count_ms = tick_count_ms;
	g_qpc_frequency = frequency.QuadPart;
	g_last_qpc = qpc.QuadPart;
	g_win32_timing_probe_ok = win32_timing_ok;
}

void run_original_core_probe()
{
	char file[] = "cnc_port_boot";
	InitRandom(ORIGINAL_CORE_PROBE_SEED);
	g_original_logic_random_value = GetGameLogicRandomValue(10, 100, file, 1);
	g_original_logic_seed_crc = GetGameLogicRandomSeedCRC();
	g_original_core_probe_ok = true;
}

void run_original_debug_probe()
{
	install_debug_handlers();
	const int starting_messages = g_debug_message_count;
	const int starting_asserts = g_debug_assert_count;
	WWRELEASE_SAY(("cnc-port wwdebug info frame=%u", g_frame));
	WWRELEASE_WARNING(("cnc-port wwdebug warning frame=%u", g_frame));
	WWRELEASE_ERROR(("cnc-port wwdebug error frame=%u", g_frame));
	WWDebug_Assert_Fail_Print(
		"cnc_port_debug_probe",
		"wasm_port_entry.cpp",
		1,
		"browser handler installed");
	g_debug_probe_ok =
		g_debug_handlers_installed &&
		g_debug_message_count >= starting_messages + 3 &&
		g_debug_assert_count >= starting_asserts + 1;
}

void run_original_debug_log_probe()
{
	int flags = DebugGetFlags();
	if (flags == 0) {
		DebugInit(DEBUG_FLAG_LOG_TO_CONSOLE);
	} else if ((flags & DEBUG_FLAG_LOG_TO_CONSOLE) == 0) {
		DebugSetFlags(flags | DEBUG_FLAG_LOG_TO_CONSOLE);
	}

	char message[128];
	std::snprintf(message, sizeof(message), "cnc-port debuglog frame=%u", g_frame);
	DEBUG_LOG(("%s\n", message));

	g_common_debug_log_flags = DebugGetFlags();
	g_common_debug_log_last_message = message;
	++g_common_debug_log_count;
	g_common_debug_log_probe_ok =
		(g_common_debug_log_flags & DEBUG_FLAG_LOG_TO_CONSOLE) != 0 &&
		g_common_debug_log_count > 0;
}

void run_original_global_data_probe()
{
	g_global_data_probe = probe_original_global_data();
	std::printf("cnc-port: globaldata probe ok=%d userData=%s\n",
		g_global_data_probe.ok ? 1 : 0,
		g_global_data_probe.user_data_path.c_str());
}

void run_original_command_line_probe()
{
	g_command_line_probe = probe_original_command_line();
	std::printf("cnc-port: commandline probe ok=%d resolution=%dx%d\n",
		g_command_line_probe.ok ? 1 : 0,
		g_command_line_probe.x_resolution,
		g_command_line_probe.y_resolution);
}

void run_original_cd_manager_probe()
{
	g_cd_manager_probe = probe_original_cd_manager();
	std::printf("cnc-port: cdmanager probe ok=%d drives=%d\n",
		g_cd_manager_probe.ok ? 1 : 0,
		g_cd_manager_probe.drive_count);
}

void probe_registered_archive_set_for_boot()
{
	g_archive_mount.boot_probe_attempted = g_archive_mount.registered;
	g_archive_mount.boot_probe_ok = false;
	g_archive_mount.boot_probe_indexed_file_count = 0;
	if (!g_archive_mount.registered) {
		return;
	}

	const std::string archive_path = g_archive_mount.directory + g_archive_mount.file_mask;
	g_archive_probe = probe_original_archive(archive_path.c_str());
	g_archive_mount.boot_probe_ok = g_archive_probe.ok;
	g_archive_mount.boot_probe_indexed_file_count = g_archive_probe.indexed_file_count;
	std::printf("cnc-port: boot archive probe path=%s ok=%d indexed=%zu\n",
		archive_path.c_str(),
		g_archive_probe.ok ? 1 : 0,
		g_archive_probe.indexed_file_count);
}

bool startup_boot_ini_present()
{
	return g_archive_probe.has_armor_ini &&
		g_archive_probe.has_command_button_ini &&
		g_archive_probe.has_game_data_ini &&
		g_archive_probe.has_terrain_ini &&
		g_archive_probe.has_roads_ini &&
		g_archive_probe.has_upgrade_ini &&
		g_archive_probe.has_weapon_ini;
}

bool startup_archive_probe_loaded()
{
	return g_archive_probe.loaded &&
		g_archive_probe.indexed_file_count > 0 &&
		g_archive_probe.sample_bytes > 0;
}

bool startup_game_data_ready()
{
	return g_archive_probe.has_game_data_ini &&
		g_archive_probe.game_data_attempted &&
		g_archive_probe.game_data_ok;
}

bool startup_armor_ready()
{
	return g_archive_probe.has_armor_ini &&
		g_archive_probe.armor_attempted &&
		g_archive_probe.armor_ok;
}

bool startup_science_ready()
{
	return g_archive_probe.has_science_ini &&
		g_archive_probe.science_attempted &&
		g_archive_probe.science_ok;
}

bool startup_special_power_ready()
{
	return g_archive_probe.has_special_power_ini &&
		g_archive_probe.special_power_attempted &&
		g_archive_probe.special_power_ok;
}

bool startup_player_template_ready()
{
	return g_archive_probe.has_player_template_ini &&
		g_archive_probe.player_template_attempted &&
		g_archive_probe.player_template_ok;
}

bool startup_multiplayer_ready()
{
	return g_archive_probe.has_multiplayer_ini &&
		g_archive_probe.multiplayer_attempted &&
		g_archive_probe.multiplayer_ok;
}

bool startup_terrain_ready()
{
	return g_archive_probe.has_terrain_ini &&
		g_archive_probe.terrain_attempted &&
		g_archive_probe.terrain_ok;
}

bool startup_terrain_roads_ready()
{
	return g_archive_probe.has_roads_ini &&
		g_archive_probe.terrain_roads_attempted &&
		g_archive_probe.terrain_roads_ok;
}

bool startup_upgrade_ready()
{
	return g_archive_probe.has_upgrade_ini &&
		g_archive_probe.upgrade_attempted &&
		g_archive_probe.upgrade_ok;
}

bool startup_command_button_ready()
{
	return g_archive_probe.has_command_button_ini &&
		g_archive_probe.command_button_attempted &&
		g_archive_probe.command_button_ok;
}

bool startup_game_text_ready()
{
	return g_archive_probe.has_generals_csf &&
		g_archive_probe.game_text_attempted &&
		g_archive_probe.game_text_ok;
}

bool startup_water_ready()
{
	return g_archive_probe.has_water_ini &&
		g_archive_probe.water_attempted &&
		g_archive_probe.water_ok;
}

bool startup_weather_ready()
{
	return g_archive_probe.has_weather_ini &&
		g_archive_probe.weather_attempted &&
		g_archive_probe.weather_ok;
}

bool startup_video_ready()
{
	return g_archive_probe.has_video_ini &&
		g_archive_probe.video_attempted &&
		g_archive_probe.video_ok;
}

bool startup_map_cache_ready()
{
	return g_archive_probe.has_map_cache_ini &&
		g_archive_probe.map_cache_attempted &&
		g_archive_probe.map_cache_ok;
}

bool startup_assets_ready()
{
	return g_archive_mount.registered &&
		g_archive_mount.boot_probe_attempted &&
		g_archive_mount.boot_probe_ok &&
		g_archive_probe.ok &&
		startup_archive_probe_loaded() &&
		startup_boot_ini_present() &&
		startup_armor_ready() &&
		startup_science_ready() &&
		startup_special_power_ready() &&
		startup_player_template_ready() &&
		startup_multiplayer_ready() &&
		startup_terrain_ready() &&
		startup_terrain_roads_ready() &&
		startup_upgrade_ready() &&
		startup_command_button_ready() &&
		startup_game_data_ready() &&
		startup_water_ready() &&
		startup_weather_ready() &&
		startup_video_ready() &&
		startup_game_text_ready() &&
		startup_map_cache_ready();
}

const char *startup_asset_status()
{
	if (!g_archive_mount.registered) {
		return "missing_runtime_archives";
	}
	if (!g_archive_mount.boot_probe_attempted) {
		return "pending_boot_probe";
	}
	if (!startup_archive_probe_loaded()) {
		return "archive_probe_failed";
	}
	if (!startup_boot_ini_present()) {
		return "missing_boot_ini";
	}
	if (!startup_armor_ready()) {
		return "armor_probe_failed";
	}
	if (!startup_science_ready()) {
		return "science_probe_failed";
	}
	if (!startup_special_power_ready()) {
		return "special_power_probe_failed";
	}
	if (!startup_player_template_ready()) {
		return "player_template_probe_failed";
	}
	if (!startup_multiplayer_ready()) {
		return "multiplayer_probe_failed";
	}
	if (!startup_terrain_ready()) {
		return "terrain_probe_failed";
	}
	if (!startup_terrain_roads_ready()) {
		return "terrain_roads_probe_failed";
	}
	if (!startup_upgrade_ready()) {
		return "upgrade_probe_failed";
	}
	if (!startup_command_button_ready()) {
		return "command_button_probe_failed";
	}
	if (!startup_game_data_ready()) {
		return "game_data_probe_failed";
	}
	if (!startup_water_ready()) {
		return "water_probe_failed";
	}
	if (!startup_weather_ready()) {
		return "weather_probe_failed";
	}
	if (!startup_video_ready()) {
		return "video_probe_failed";
	}
	if (!startup_game_text_ready()) {
		return "game_text_probe_failed";
	}
	if (!startup_map_cache_ready()) {
		return "map_cache_probe_failed";
	}
	if (!g_archive_mount.boot_probe_ok || !g_archive_probe.ok) {
		return "archive_probe_failed";
	}
	return "ready";
}

const char *startup_asset_message()
{
	if (!g_archive_mount.registered) {
		return "Register the Zero Hour runtime BIG archive set before engine startup.";
	}
	if (!g_archive_mount.boot_probe_attempted) {
		return "Runtime BIG archive set is registered; boot probe has not run yet.";
	}
	if (!startup_archive_probe_loaded()) {
		return "Runtime BIG archive boot probe failed.";
	}
	if (!startup_boot_ini_present()) {
		return "Runtime BIG archive set is missing required boot INI files.";
	}
	if (!startup_armor_ready()) {
		return "Runtime BIG archive set did not pass the Armor.ini startup probe.";
	}
	if (!startup_science_ready()) {
		return "Runtime BIG archive set did not pass the Science.ini startup probe.";
	}
	if (!startup_special_power_ready()) {
		return "Runtime BIG archive set did not pass the SpecialPower.ini startup probe.";
	}
	if (!startup_player_template_ready()) {
		return "Runtime BIG archive set did not pass the PlayerTemplate.ini startup probe.";
	}
	if (!startup_multiplayer_ready()) {
		return "Runtime BIG archive set did not pass the Multiplayer.ini startup probe.";
	}
	if (!startup_terrain_ready()) {
		return "Runtime BIG archive set did not pass the Terrain.ini startup probe.";
	}
	if (!startup_terrain_roads_ready()) {
		return "Runtime BIG archive set did not pass the Roads.ini startup probe.";
	}
	if (!startup_upgrade_ready()) {
		return "Runtime BIG archive set did not pass the Upgrade.ini startup probe.";
	}
	if (!startup_command_button_ready()) {
		return "Runtime BIG archive set did not pass the CommandButton.ini startup probe.";
	}
	if (!startup_game_data_ready()) {
		return "Runtime BIG archive set did not pass the GameData.ini startup probe.";
	}
	if (!startup_water_ready()) {
		return "Runtime BIG archive set did not pass the Water.ini startup probe.";
	}
	if (!startup_weather_ready()) {
		return "Runtime BIG archive set did not pass the Weather.ini startup probe.";
	}
	if (!startup_video_ready()) {
		return "Runtime BIG archive set did not pass the Video.ini startup probe.";
	}
	if (!startup_game_text_ready()) {
		return "Runtime BIG archive set did not pass the GameText CSF startup probe.";
	}
	if (!startup_map_cache_ready()) {
		return "Runtime BIG archive set did not pass the MapCache.ini startup probe.";
	}
	if (!g_archive_mount.boot_probe_ok || !g_archive_probe.ok) {
		return "Runtime BIG archive boot probe failed.";
	}
	return "Runtime BIG archive set is ready for original engine startup.";
}

void log_boot_state()
{
	std::printf("cnc-port: boot frame=%u timingSource=emscripten_get_now rng=%d crc=%u\n",
		g_frame,
		g_original_logic_random_value,
		g_original_logic_seed_crc);
}

std::string json_escape(const std::string &value)
{
	std::string escaped;
	escaped.reserve(value.size());
	for (const char ch : value) {
		switch (ch) {
			case '\\':
				escaped += "\\\\";
				break;
			case '"':
				escaped += "\\\"";
				break;
			case '\n':
				escaped += "\\n";
				break;
			case '\r':
				escaped += "\\r";
				break;
			case '\t':
				escaped += "\\t";
				break;
			default:
				escaped += ch;
				break;
		}
	}
	return escaped;
}

std::string build_upgrade_probe_json()
{
	char buffer[6000];
	const std::string source_json = json_escape(g_archive_probe.upgrade_source);
	const std::string flash_bang_display_name_json =
		json_escape(g_archive_probe.upgrade_flash_bang_display_name);
	const std::string capture_building_display_name_json =
		json_escape(g_archive_probe.upgrade_capture_building_display_name);
	const std::string laser_missiles_display_name_json =
		json_escape(g_archive_probe.upgrade_laser_missiles_display_name);
	const std::string china_mines_display_name_json =
		json_escape(g_archive_probe.upgrade_china_mines_display_name);
	const std::string america_radar_display_name_json =
		json_escape(g_archive_probe.upgrade_america_radar_display_name);
	const std::string flash_bang_research_sound_json =
		json_escape(g_archive_probe.upgrade_flash_bang_research_sound);
	const std::string laser_missiles_research_sound_json =
		json_escape(g_archive_probe.upgrade_laser_missiles_research_sound);
	const std::string china_mines_research_sound_json =
		json_escape(g_archive_probe.upgrade_china_mines_research_sound);
	const std::string america_radar_research_sound_json =
		json_escape(g_archive_probe.upgrade_america_radar_research_sound);

	std::snprintf(buffer, sizeof(buffer),
		"{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"source\":\"%s\",\"loadedArchives\":%s,\"fileExists\":%s,"
		"\"nameKeyGeneratorLoaded\":%s,\"originalIniLoad\":%s,"
		"\"parsedFields\":%zu,\"upgrades\":%zu,"
		"\"veterancy\":{\"veteran\":%s,\"elite\":%s,\"heroic\":%s},"
		"\"flashBang\":{\"found\":%s,\"displayName\":\"%s\",\"type\":%d,"
		"\"buildFrames\":%d,\"cost\":%d,\"researchSound\":\"%s\"},"
		"\"captureBuilding\":{\"found\":%s,\"displayName\":\"%s\",\"type\":%d,"
		"\"buildFrames\":%d,\"cost\":%d},"
		"\"laserMissiles\":{\"found\":%s,\"displayName\":\"%s\",\"type\":%d,"
		"\"buildFrames\":%d,\"cost\":%d,\"researchSound\":\"%s\"},"
		"\"chinaMines\":{\"found\":%s,\"displayName\":\"%s\",\"type\":%d,"
		"\"buildFrames\":%d,\"cost\":%d,\"researchSound\":\"%s\"},"
		"\"americaRadar\":{\"found\":%s,\"displayName\":\"%s\",\"type\":%d,"
		"\"buildFrames\":%d,\"cost\":%d,\"researchSound\":\"%s\","
		"\"academyClassification\":%d}}",
		g_archive_probe.upgrade_attempted ? "true" : "false",
		g_archive_probe.upgrade_ok ? "true" : "false",
		g_archive_probe.upgrade_bytes,
		source_json.c_str(),
		g_archive_probe.upgrade_loaded_archives ? "true" : "false",
		g_archive_probe.upgrade_file_exists ? "true" : "false",
		g_archive_probe.upgrade_name_key_generator_loaded ? "true" : "false",
		g_archive_probe.upgrade_original_ini_load ? "true" : "false",
		g_archive_probe.upgrade_parsed_fields,
		g_archive_probe.upgrade_count,
		g_archive_probe.upgrade_veteran_found ? "true" : "false",
		g_archive_probe.upgrade_elite_found ? "true" : "false",
		g_archive_probe.upgrade_heroic_found ? "true" : "false",
		g_archive_probe.upgrade_flash_bang_found ? "true" : "false",
		flash_bang_display_name_json.c_str(),
		g_archive_probe.upgrade_flash_bang_type,
		g_archive_probe.upgrade_flash_bang_build_frames,
		g_archive_probe.upgrade_flash_bang_cost,
		flash_bang_research_sound_json.c_str(),
		g_archive_probe.upgrade_capture_building_found ? "true" : "false",
		capture_building_display_name_json.c_str(),
		g_archive_probe.upgrade_capture_building_type,
		g_archive_probe.upgrade_capture_building_build_frames,
		g_archive_probe.upgrade_capture_building_cost,
		g_archive_probe.upgrade_laser_missiles_found ? "true" : "false",
		laser_missiles_display_name_json.c_str(),
		g_archive_probe.upgrade_laser_missiles_type,
		g_archive_probe.upgrade_laser_missiles_build_frames,
		g_archive_probe.upgrade_laser_missiles_cost,
		laser_missiles_research_sound_json.c_str(),
		g_archive_probe.upgrade_china_mines_found ? "true" : "false",
		china_mines_display_name_json.c_str(),
		g_archive_probe.upgrade_china_mines_type,
		g_archive_probe.upgrade_china_mines_build_frames,
		g_archive_probe.upgrade_china_mines_cost,
		china_mines_research_sound_json.c_str(),
		g_archive_probe.upgrade_america_radar_found ? "true" : "false",
		america_radar_display_name_json.c_str(),
		g_archive_probe.upgrade_america_radar_type,
		g_archive_probe.upgrade_america_radar_build_frames,
		g_archive_probe.upgrade_america_radar_cost,
		america_radar_research_sound_json.c_str(),
		g_archive_probe.upgrade_america_radar_academy_classification);

	return buffer;
}

std::string build_command_button_probe_json()
{
	char buffer[9000];
	const std::string source_json = json_escape(g_archive_probe.command_button_source);
	const std::string flash_bang_upgrade_name_json =
		json_escape(g_archive_probe.command_button_flash_bang_upgrade_name);
	const std::string flash_bang_upgrade_label_json =
		json_escape(g_archive_probe.command_button_flash_bang_upgrade_label);
	const std::string flash_bang_upgrade_description_json =
		json_escape(g_archive_probe.command_button_flash_bang_upgrade_description);
	const std::string ranger_capture_upgrade_name_json =
		json_escape(g_archive_probe.command_button_ranger_capture_upgrade_name);
	const std::string ranger_capture_special_power_name_json =
		json_escape(g_archive_probe.command_button_ranger_capture_special_power_name);
	const std::string ranger_capture_label_json =
		json_escape(g_archive_probe.command_button_ranger_capture_label);
	const std::string ranger_capture_description_json =
		json_escape(g_archive_probe.command_button_ranger_capture_description);
	const std::string ranger_capture_cursor_json =
		json_escape(g_archive_probe.command_button_ranger_capture_cursor);
	const std::string ranger_capture_invalid_cursor_json =
		json_escape(g_archive_probe.command_button_ranger_capture_invalid_cursor);
	const std::string flash_bang_switch_upgrade_name_json =
		json_escape(g_archive_probe.command_button_flash_bang_switch_upgrade_name);
	const std::string flash_bang_switch_label_json =
		json_escape(g_archive_probe.command_button_flash_bang_switch_label);
	const std::string flash_bang_switch_description_json =
		json_escape(g_archive_probe.command_button_flash_bang_switch_description);

	std::snprintf(buffer, sizeof(buffer),
		"{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"scienceBytes\":%zu,\"specialPowerBytes\":%zu,\"upgradeBytes\":%zu,"
		"\"source\":\"%s\",\"loadedArchives\":%s,\"fileExists\":%s,"
		"\"scienceFileExists\":%s,\"specialPowerFileExists\":%s,"
		"\"upgradeFileExists\":%s,\"nameKeyGeneratorLoaded\":%s,"
		"\"scienceOriginalIniLoad\":%s,\"specialPowerOriginalIniLoad\":%s,"
		"\"upgradeOriginalIniLoad\":%s,\"originalIniLoad\":%s,"
		"\"filteredFromShipped\":%s,\"filteredBytes\":%zu,"
		"\"filteredBlocks\":%zu,\"parsedFields\":%zu,\"buttons\":%zu,"
		"\"specialPowerOptionPairingValid\":%s,"
		"\"flashBangUpgrade\":{\"found\":%s,\"command\":%d,\"border\":%d,"
		"\"upgrade\":\"%s\",\"textLabel\":\"%s\",\"description\":\"%s\"},"
		"\"rangerCapture\":{\"found\":%s,\"command\":%d,\"options\":%u,"
		"\"border\":%d,\"upgrade\":\"%s\",\"specialPower\":\"%s\","
		"\"textLabel\":\"%s\",\"description\":\"%s\","
		"\"cursor\":\"%s\",\"invalidCursor\":\"%s\","
		"\"hasEnemyTarget\":%s,\"hasNeutralTarget\":%s,"
		"\"hasMultiSelect\":%s,\"hasNeedUpgrade\":%s,"
		"\"hasNeedSpecialPowerScience\":%s},"
		"\"flashBangSwitch\":{\"found\":%s,\"command\":%d,\"options\":%u,"
		"\"weaponSlot\":%d,\"border\":%d,\"upgrade\":\"%s\","
		"\"textLabel\":\"%s\",\"description\":\"%s\","
		"\"hasCheckLike\":%s,\"hasMultiSelect\":%s,\"hasNeedUpgrade\":%s}}",
		g_archive_probe.command_button_attempted ? "true" : "false",
		g_archive_probe.command_button_ok ? "true" : "false",
		g_archive_probe.command_button_bytes,
		g_archive_probe.command_button_science_bytes,
		g_archive_probe.command_button_special_power_bytes,
		g_archive_probe.command_button_upgrade_bytes,
		source_json.c_str(),
		g_archive_probe.command_button_loaded_archives ? "true" : "false",
		g_archive_probe.command_button_file_exists ? "true" : "false",
		g_archive_probe.command_button_science_file_exists ? "true" : "false",
		g_archive_probe.command_button_special_power_file_exists ? "true" : "false",
		g_archive_probe.command_button_upgrade_file_exists ? "true" : "false",
		g_archive_probe.command_button_name_key_generator_loaded ? "true" : "false",
		g_archive_probe.command_button_science_original_ini_load ? "true" : "false",
		g_archive_probe.command_button_special_power_original_ini_load ? "true" : "false",
		g_archive_probe.command_button_upgrade_original_ini_load ? "true" : "false",
		g_archive_probe.command_button_original_ini_load ? "true" : "false",
		g_archive_probe.command_button_filtered_from_shipped ? "true" : "false",
		g_archive_probe.command_button_filtered_bytes,
		g_archive_probe.command_button_filtered_blocks,
		g_archive_probe.command_button_parsed_fields,
		g_archive_probe.command_button_count,
		g_archive_probe.command_button_special_power_option_pairing_valid ? "true" : "false",
		g_archive_probe.command_button_flash_bang_upgrade_found ? "true" : "false",
		g_archive_probe.command_button_flash_bang_upgrade_command,
		g_archive_probe.command_button_flash_bang_upgrade_border,
		flash_bang_upgrade_name_json.c_str(),
		flash_bang_upgrade_label_json.c_str(),
		flash_bang_upgrade_description_json.c_str(),
		g_archive_probe.command_button_ranger_capture_found ? "true" : "false",
		g_archive_probe.command_button_ranger_capture_command,
		g_archive_probe.command_button_ranger_capture_options,
		g_archive_probe.command_button_ranger_capture_border,
		ranger_capture_upgrade_name_json.c_str(),
		ranger_capture_special_power_name_json.c_str(),
		ranger_capture_label_json.c_str(),
		ranger_capture_description_json.c_str(),
		ranger_capture_cursor_json.c_str(),
		ranger_capture_invalid_cursor_json.c_str(),
		g_archive_probe.command_button_ranger_capture_has_enemy_target ? "true" : "false",
		g_archive_probe.command_button_ranger_capture_has_neutral_target ? "true" : "false",
		g_archive_probe.command_button_ranger_capture_has_multi_select ? "true" : "false",
		g_archive_probe.command_button_ranger_capture_has_need_upgrade ? "true" : "false",
		g_archive_probe.command_button_ranger_capture_has_need_special_power_science ?
			"true" : "false",
		g_archive_probe.command_button_flash_bang_switch_found ? "true" : "false",
		g_archive_probe.command_button_flash_bang_switch_command,
		g_archive_probe.command_button_flash_bang_switch_options,
		g_archive_probe.command_button_flash_bang_switch_weapon_slot,
		g_archive_probe.command_button_flash_bang_switch_border,
		flash_bang_switch_upgrade_name_json.c_str(),
		flash_bang_switch_label_json.c_str(),
		flash_bang_switch_description_json.c_str(),
		g_archive_probe.command_button_flash_bang_switch_has_check_like ? "true" : "false",
		g_archive_probe.command_button_flash_bang_switch_has_multi_select ? "true" : "false",
		g_archive_probe.command_button_flash_bang_switch_has_need_upgrade ? "true" : "false");

	return buffer;
}

void ensure_booted()
{
	if (!g_booted) {
		g_booted = true;
		++g_frame;
		record_tick_time();
		run_original_core_probe();
		run_original_debug_probe();
		run_original_debug_log_probe();
		run_original_global_data_probe();
		run_original_command_line_probe();
		run_original_cd_manager_probe();
		probe_registered_archive_set_for_boot();
		log_boot_state();
	}
}

void tick_frame()
{
	if (g_booted) {
		++g_frame;
		record_tick_time();
	}
}

void main_loop_tick()
{
	if (!g_main_loop_running) {
		return;
	}
	tick_frame();
	++g_main_loop_ticks;
}

const char *write_state_json()
{
	char buffer[96000];
	const std::string archive_path_json = json_escape(g_archive_probe.archive_path);
	const std::string armor_source_json = json_escape(g_archive_probe.armor_source);
	const std::string science_source_json = json_escape(g_archive_probe.science_source);
	const std::string upgrade_probe_json = build_upgrade_probe_json();
	const std::string command_button_probe_json = build_command_button_probe_json();
	const std::string special_power_source_json =
		json_escape(g_archive_probe.special_power_source);
	const std::string special_power_daisy_cutter_required_science_json =
		json_escape(g_archive_probe.special_power_daisy_cutter_required_science);
	const std::string special_power_crate_drop_required_science_json =
		json_escape(g_archive_probe.special_power_crate_drop_required_science);
	const std::string special_power_neutron_sound_json =
		json_escape(g_archive_probe.special_power_neutron_missile_initiate_at_location_sound);
	const std::string special_power_scud_sound_json =
		json_escape(g_archive_probe.special_power_scud_storm_initiate_sound);
	const std::string player_template_source_json =
		json_escape(g_archive_probe.player_template_source);
	const std::string player_template_america_side_json =
		json_escape(g_archive_probe.player_template_america_side);
	const std::string player_template_america_base_side_json =
		json_escape(g_archive_probe.player_template_america_base_side);
	const std::string player_template_america_starting_building_json =
		json_escape(g_archive_probe.player_template_america_starting_building);
	const std::string player_template_america_starting_unit0_json =
		json_escape(g_archive_probe.player_template_america_starting_unit0);
	const std::string player_template_america_shortcut_command_set_json =
		json_escape(g_archive_probe.player_template_america_shortcut_command_set);
	const std::string player_template_america_shortcut_win_name_json =
		json_escape(g_archive_probe.player_template_america_shortcut_win_name);
	const std::string player_template_america_load_screen_json =
		json_escape(g_archive_probe.player_template_america_load_screen);
	const std::string player_template_america_score_screen_json =
		json_escape(g_archive_probe.player_template_america_score_screen);
	const std::string player_template_america_load_music_json =
		json_escape(g_archive_probe.player_template_america_load_music);
	const std::string player_template_america_score_music_json =
		json_escape(g_archive_probe.player_template_america_score_music);
	const std::string player_template_america_beacon_json =
		json_escape(g_archive_probe.player_template_america_beacon);
	const std::string player_template_observer_side_json =
		json_escape(g_archive_probe.player_template_observer_side);
	const std::string player_template_observer_load_screen_json =
		json_escape(g_archive_probe.player_template_observer_load_screen);
	const std::string player_template_observer_beacon_json =
		json_escape(g_archive_probe.player_template_observer_beacon);
	const std::string player_template_air_force_side_json =
		json_escape(g_archive_probe.player_template_air_force_side);
	const std::string player_template_air_force_base_side_json =
		json_escape(g_archive_probe.player_template_air_force_base_side);
	const std::string player_template_air_force_starting_building_json =
		json_escape(g_archive_probe.player_template_air_force_starting_building);
	const std::string player_template_air_force_starting_unit0_json =
		json_escape(g_archive_probe.player_template_air_force_starting_unit0);
	const std::string player_template_air_force_shortcut_command_set_json =
		json_escape(g_archive_probe.player_template_air_force_shortcut_command_set);
	const std::string player_template_boss_side_json =
		json_escape(g_archive_probe.player_template_boss_side);
	const std::string player_template_boss_base_side_json =
		json_escape(g_archive_probe.player_template_boss_base_side);
	const std::string player_template_boss_starting_building_json =
		json_escape(g_archive_probe.player_template_boss_starting_building);
	const std::string player_template_boss_starting_unit0_json =
		json_escape(g_archive_probe.player_template_boss_starting_unit0);
	const std::string player_template_boss_shortcut_command_set_json =
		json_escape(g_archive_probe.player_template_boss_shortcut_command_set);
	const std::string player_template_boss_shortcut_win_name_json =
		json_escape(g_archive_probe.player_template_boss_shortcut_win_name);
	const std::string game_data_shell_map_name_json =
		json_escape(g_archive_probe.game_data_shell_map_name);
	const std::string game_data_source_json = json_escape(g_archive_probe.game_data_source);
	const std::string multiplayer_source_json = json_escape(g_archive_probe.multiplayer_source);
	const std::string terrain_source_json = json_escape(g_archive_probe.terrain_source);
	const std::string terrain_transition_texture_json =
		json_escape(g_archive_probe.terrain_transition_texture);
	const std::string terrain_asphalt_texture_json =
		json_escape(g_archive_probe.terrain_asphalt_texture);
	const std::string terrain_desert_dry_texture_json =
		json_escape(g_archive_probe.terrain_desert_dry_texture);
	const std::string terrain_beach_tropical_texture_json =
		json_escape(g_archive_probe.terrain_beach_tropical_texture);
	const std::string terrain_snow_flat_texture_json =
		json_escape(g_archive_probe.terrain_snow_flat_texture);
	const std::string terrain_roads_source_json =
		json_escape(g_archive_probe.terrain_roads_source);
	const std::string terrain_roads_two_lane_texture_json =
		json_escape(g_archive_probe.terrain_roads_two_lane_texture);
	const std::string terrain_roads_four_lane_texture_json =
		json_escape(g_archive_probe.terrain_roads_four_lane_texture);
	const std::string terrain_roads_dirt_road_texture_json =
		json_escape(g_archive_probe.terrain_roads_dirt_road_texture);
	const std::string terrain_roads_concrete_bridge_texture_json =
		json_escape(g_archive_probe.terrain_roads_concrete_bridge_texture);
	const std::string terrain_roads_concrete_bridge_model_json =
		json_escape(g_archive_probe.terrain_roads_concrete_bridge_model);
	const std::string terrain_roads_concrete_bridge_damaged_texture_json =
		json_escape(g_archive_probe.terrain_roads_concrete_bridge_damaged_texture);
	const std::string terrain_roads_concrete_bridge_scaffold_json =
		json_escape(g_archive_probe.terrain_roads_concrete_bridge_scaffold);
	const std::string terrain_roads_concrete_bridge_tower_left_json =
		json_escape(g_archive_probe.terrain_roads_concrete_bridge_tower_left);
	const std::string terrain_roads_concrete_bridge_damage_sound_json =
		json_escape(g_archive_probe.terrain_roads_concrete_bridge_damage_sound);
	const std::string terrain_roads_concrete_bridge_repaired_sound_json =
		json_escape(g_archive_probe.terrain_roads_concrete_bridge_repaired_sound);
	const std::string terrain_roads_concrete_bridge_damage_ocl_json =
		json_escape(g_archive_probe.terrain_roads_concrete_bridge_damage_ocl);
	const std::string terrain_roads_concrete_bridge_damage_fx_json =
		json_escape(g_archive_probe.terrain_roads_concrete_bridge_damage_fx);
	const std::string terrain_roads_concrete_bridge_repair_fx_json =
		json_escape(g_archive_probe.terrain_roads_concrete_bridge_repair_fx);
	const std::string water_source_json = json_escape(g_archive_probe.water_source);
	const std::string water_morning_sky_texture_json =
		json_escape(g_archive_probe.water_morning_sky_texture);
	const std::string water_morning_water_texture_json =
		json_escape(g_archive_probe.water_morning_water_texture);
	const std::string water_night_sky_texture_json =
		json_escape(g_archive_probe.water_night_sky_texture);
	const std::string water_night_water_texture_json =
		json_escape(g_archive_probe.water_night_water_texture);
	const std::string water_standing_water_texture_json =
		json_escape(g_archive_probe.water_standing_water_texture);
	const std::string weather_source_json = json_escape(g_archive_probe.weather_source);
	const std::string weather_snow_texture_json =
		json_escape(g_archive_probe.weather_snow_texture);
	const std::string video_source_json = json_escape(g_archive_probe.video_source);
	const std::string video_first_internal_name_json =
		json_escape(g_archive_probe.video_first_internal_name);
	const std::string video_first_filename_json =
		json_escape(g_archive_probe.video_first_filename);
	const std::string video_sample_internal_name_json =
		json_escape(g_archive_probe.video_sample_internal_name);
	const std::string video_sample_filename_json =
		json_escape(g_archive_probe.video_sample_filename);
	const std::string map_cache_source_json = json_escape(g_archive_probe.map_cache_source);
	const std::string archive_mount_directory_json = json_escape(g_archive_mount.directory);
	const std::string archive_mount_file_mask_json = json_escape(g_archive_mount.file_mask);
	const std::string startup_asset_status_json = json_escape(startup_asset_status());
	const std::string startup_asset_message_json = json_escape(startup_asset_message());
	const std::string global_data_source_json = json_escape(g_global_data_probe.source);
	const std::string global_data_user_data_path_json =
		json_escape(g_global_data_probe.user_data_path);
	const std::string global_data_shell_map_name_json =
		json_escape(g_global_data_probe.shell_map_name);
	const std::string command_line_source_json = json_escape(g_command_line_probe.source);
	const std::string cd_manager_source_json = json_escape(g_cd_manager_probe.source);
	const std::string debug_last_type_json = json_escape(g_debug_last_type);
	const std::string debug_last_message_json = json_escape(g_debug_last_message);
	const std::string debug_last_assert_json = json_escape(g_debug_last_assert);
	const std::string common_debug_log_last_message_json =
		json_escape(g_common_debug_log_last_message);
	std::snprintf(buffer, sizeof(buffer),
		"{\"booted\":%s,\"frame\":%u,\"module\":\"wasm-port-bootstrap\","
		"\"mainLoop\":{\"running\":%s,\"fps\":%d,\"ticks\":%u},"
		"\"timing\":{\"source\":\"emscripten_get_now\",\"ok\":%s,"
		"\"bootMs\":%.3f,\"lastTickMs\":%.3f,\"lastDeltaMs\":%.3f},"
		"\"win32Timing\":{\"source\":\"browser_win32_shim\",\"ok\":%s,"
		"\"frequency\":%lld,\"bootQpc\":%lld,\"lastQpc\":%lld,"
		"\"bootTimeGetTime\":%lu,\"lastTimeGetTime\":%lu,"
		"\"bootTickCount\":%lu,\"lastTickCount\":%lu},"
		"\"assetProbe\":{\"attempted\":%s,\"ok\":%s,\"loaded\":%s,"
		"\"archive\":\"%s\",\"reader\":\"Win32BIGFileSystem\","
		"\"indexedFiles\":%zu,\"sampleBytes\":%zu,"
		"\"inizh\":{\"armorIni\":%s,\"commandButtonIni\":%s,"
		"\"playerTemplateIni\":%s,\"gameDataIni\":%s,\"scienceIni\":%s,\"specialPowerIni\":%s,"
		"\"multiplayerIni\":%s,"
		"\"terrainIni\":%s,\"roadsIni\":%s,\"upgradeIni\":%s,"
		"\"waterIni\":%s,\"weatherIni\":%s,"
		"\"videoIni\":%s,\"defaultVideoIni\":%s,"
		"\"weaponIni\":%s},"
		"\"maps\":{\"mapCacheIni\":%s},"
		"\"armor\":{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"source\":\"%s\",\"loadedArchives\":%s,\"fileExists\":%s,"
		"\"nameKeyGeneratorLoaded\":%s,\"originalIniLoad\":%s,"
		"\"parsedFields\":%zu,\"noArmor\":%s,\"humanArmor\":%s,"
		"\"tankArmor\":%s,\"noArmorExplosionDamage\":%.3f,"
		"\"noArmorHazardCleanupDamage\":%.3f,\"humanCrushDamage\":%.3f,"
		"\"humanArmorPiercingDamage\":%.3f,\"humanFlameDamage\":%.3f,"
		"\"tankSmallArmsDamage\":%.3f,\"tankRadiationDamage\":%.3f,"
		"\"tankMicrowaveDamage\":%.3f},"
		"\"science\":{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"source\":\"%s\",\"loadedArchives\":%s,\"fileExists\":%s,"
		"\"gameTextLoaded\":%s,\"nameKeyGeneratorLoaded\":%s,"
		"\"originalIniLoad\":%s,\"parsedFields\":%zu,\"sciences\":%zu,"
		"\"america\":%s,\"rank3\":%s,\"paladinTank\":%s,"
		"\"paladinNameLoaded\":%s,\"paladinDescriptionLoaded\":%s,"
		"\"americaPurchaseCost\":%d,\"paladinPurchaseCost\":%d,"
		"\"americaGrantable\":%s,\"paladinGrantable\":%s},"
		"\"upgrade\":%s,"
		"\"commandButton\":%s,"
		"\"specialPower\":{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"scienceBytes\":%zu,\"source\":\"%s\",\"loadedArchives\":%s,"
		"\"fileExists\":%s,\"scienceFileExists\":%s,\"gameTextLoaded\":%s,"
		"\"nameKeyGeneratorLoaded\":%s,\"audioManagerLoaded\":%s,"
		"\"scienceOriginalIniLoad\":%s,\"originalIniLoad\":%s,"
		"\"parsedFields\":%zu,\"powers\":%zu,"
		"\"daisyCutter\":{\"found\":%s,\"enum\":%d,\"reloadFrames\":%d,"
		"\"requiredScienceValid\":%s,\"requiredScience\":\"%s\","
		"\"publicTimer\":%s,\"sharedSyncedTimer\":%s,"
		"\"viewObjectDurationFrames\":%d,\"viewObjectRange\":%.3f,"
		"\"radiusCursorRadius\":%.3f,\"shortcutPower\":%s,"
		"\"academyClassification\":%d},"
		"\"carpetBomb\":{\"found\":%s,\"enum\":%d,\"reloadFrames\":%d,"
		"\"publicTimer\":%s,\"sharedSyncedTimer\":%s,"
		"\"viewObjectDurationFrames\":%d,\"viewObjectRange\":%.3f,"
		"\"radiusCursorRadius\":%.3f,\"shortcutPower\":%s,"
		"\"academyClassification\":%d},"
		"\"crateDrop\":{\"found\":%s,\"enum\":%d,\"reloadFrames\":%d,"
		"\"requiredScienceValid\":%s,\"requiredScience\":\"%s\","
		"\"publicTimer\":%s,\"sharedSyncedTimer\":%s,"
		"\"viewObjectDurationFrames\":%d,\"viewObjectRange\":%.3f,"
		"\"radiusCursorRadius\":%.3f,\"shortcutPower\":%s},"
		"\"neutronMissile\":{\"found\":%s,"
		"\"initiateAtLocationSound\":\"%s\"},"
		"\"scudStorm\":{\"found\":%s,\"initiateSound\":\"%s\"}},"
		"\"playerTemplate\":{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"scienceBytes\":%zu,\"source\":\"%s\",\"loadedArchives\":%s,"
		"\"fileExists\":%s,\"scienceFileExists\":%s,\"gameTextLoaded\":%s,"
		"\"nameKeyGeneratorLoaded\":%s,\"scienceOriginalIniLoad\":%s,"
		"\"originalIniLoad\":%s,\"parsedFields\":%zu,\"templates\":%zu,"
		"\"sides\":%zu,"
		"\"found\":{\"america\":%s,\"china\":%s,\"gla\":%s,"
		"\"observer\":%s,\"airForce\":%s,\"boss\":%s},"
		"\"america\":{\"displayNameLoaded\":%s,\"side\":\"%s\",\"baseSide\":\"%s\","
		"\"playable\":%s,\"oldFaction\":%s,\"startMoney\":%d,"
		"\"intrinsicScienceCount\":%zu,\"intrinsicScienceValid\":%s,"
		"\"startingBuilding\":\"%s\",\"startingUnit0\":\"%s\","
		"\"shortcutCommandSet\":\"%s\",\"shortcutWinName\":\"%s\","
		"\"shortcutButtonCount\":%d,\"loadScreen\":\"%s\","
		"\"scoreScreen\":\"%s\",\"loadMusic\":\"%s\",\"scoreMusic\":\"%s\","
		"\"beacon\":\"%s\"},"
		"\"observer\":{\"observer\":%s,\"playable\":%s,\"side\":\"%s\","
		"\"loadScreen\":\"%s\",\"beacon\":\"%s\"},"
		"\"airForce\":{\"side\":\"%s\",\"baseSide\":\"%s\",\"playable\":%s,"
		"\"oldFaction\":%s,\"startingBuilding\":\"%s\",\"startingUnit0\":\"%s\","
		"\"shortcutCommandSet\":\"%s\",\"shortcutButtonCount\":%d},"
		"\"boss\":{\"side\":\"%s\",\"baseSide\":\"%s\",\"playable\":%s,"
		"\"oldFaction\":%s,\"intrinsicScienceCount\":%zu,"
		"\"intrinsicSciencesValid\":%s,\"startingBuilding\":\"%s\","
		"\"startingUnit0\":\"%s\",\"shortcutCommandSet\":\"%s\","
		"\"shortcutWinName\":\"%s\",\"shortcutButtonCount\":%d}},"
		"\"gameData\":{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"source\":\"%s\",\"loadedArchives\":%s,\"fileExists\":%s,"
		"\"originalIniLoad\":%s,\"parsedFields\":%zu,\"shellMapName\":\"%s\","
		"\"useFpsLimit\":%s,\"framesPerSecondLimit\":%d,"
		"\"maxShellScreens\":%d,\"useCloudMap\":%s,"
		"\"defaultStructureRubbleHeight\":%.3f,"
		"\"groupSelectVolumeBase\":%.3f,\"maxParticleCount\":%d},"
		"\"multiplayer\":{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"source\":\"%s\",\"loadedArchives\":%s,\"fileExists\":%s,"
		"\"originalIniLoad\":%s,\"parsedFields\":%zu,\"colors\":%zu,"
		"\"startingMoneyChoices\":%zu,\"startCountdownSeconds\":%d,"
		"\"maxBeaconsPerPlayer\":%d,\"useShroud\":%s,"
		"\"showRandomPlayerTemplate\":%s,\"showRandomStartPos\":%s,"
		"\"showRandomColor\":%s,\"goldColorFound\":%s,"
		"\"purpleColorFound\":%s,\"goldColor\":%u,"
		"\"purpleNightColor\":%u,\"chatDefaultColor\":%u,"
		"\"chatGameColor\":%u,\"chatPlayerNormalColor\":%u,"
		"\"chatSelfColor\":%u,\"chatMapSelectedColor\":%u,"
		"\"startingMoney\":[%d,%d,%d,%d],\"defaultStartingMoney\":%d},"
		"\"terrain\":{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"source\":\"%s\",\"loadedArchives\":%s,\"fileExists\":%s,"
		"\"originalIniLoad\":%s,\"parsedFields\":%zu,\"terrains\":%zu,"
		"\"transition\":%s,\"asphalt\":%s,\"desertDry\":%s,"
		"\"beachTropical\":%s,\"snowFlat\":%s,"
		"\"transitionTexture\":\"%s\",\"asphaltTexture\":\"%s\","
		"\"desertDryTexture\":\"%s\",\"beachTropicalTexture\":\"%s\","
		"\"snowFlatTexture\":\"%s\",\"transitionClass\":%d,"
		"\"asphaltClass\":%d,\"desertDryClass\":%d,"
		"\"beachTropicalClass\":%d,\"snowFlatClass\":%d,"
		"\"asphaltBlendEdges\":%s,\"asphaltRestrictConstruction\":%s},"
		"\"terrainRoads\":{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"source\":\"%s\",\"loadedArchives\":%s,\"fileExists\":%s,"
		"\"originalIniLoad\":%s,\"parsedFields\":%zu,\"roads\":%zu,"
		"\"bridges\":%zu,\"twoLane\":%s,\"fourLane\":%s,"
		"\"dirtRoad\":%s,\"concreteBridge\":%s,"
		"\"twoLaneTexture\":\"%s\",\"fourLaneTexture\":\"%s\","
		"\"dirtRoadTexture\":\"%s\",\"concreteBridgeTexture\":\"%s\","
		"\"concreteBridgeModel\":\"%s\","
		"\"concreteBridgeDamagedTexture\":\"%s\","
		"\"concreteBridgeScaffold\":\"%s\","
		"\"concreteBridgeTowerLeft\":\"%s\","
		"\"concreteBridgeDamageSound\":\"%s\","
		"\"concreteBridgeRepairedSound\":\"%s\","
		"\"concreteBridgeDamageOCL\":\"%s\","
		"\"concreteBridgeDamageFX\":\"%s\","
		"\"concreteBridgeRepairFX\":\"%s\","
		"\"twoLaneWidth\":%.3f,\"twoLaneWidthInTexture\":%.3f,"
		"\"fourLaneWidth\":%.3f,\"dirtRoadWidth\":%.3f,"
		"\"dirtRoadWidthInTexture\":%.3f,"
		"\"concreteBridgeScale\":%.3f,"
		"\"concreteBridgeRadarRed\":%.4f,"
		"\"concreteBridgeRadarGreen\":%.4f,"
		"\"concreteBridgeRadarBlue\":%.4f,"
		"\"concreteBridgeTransitionEffectsHeight\":%.3f,"
		"\"concreteBridgeNumFXPerType\":%d},"
		"\"water\":{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"source\":\"%s\",\"loadedArchives\":%s,\"fileExists\":%s,"
		"\"originalIniLoad\":%s,\"parsedFields\":%zu,\"waterSets\":%zu,"
		"\"transparencyLoaded\":%s,\"morningSkyTexture\":\"%s\","
		"\"morningWaterTexture\":\"%s\",\"nightSkyTexture\":\"%s\","
		"\"nightWaterTexture\":\"%s\",\"standingWaterTexture\":\"%s\","
		"\"morningRepeatCount\":%d,\"nightRepeatCount\":%d,"
		"\"morningSkyTexelsPerUnit\":%.3f,\"nightSkyTexelsPerUnit\":%.3f,"
		"\"morningUScrollPerMS\":%.4f,\"morningVScrollPerMS\":%.4f,"
		"\"nightUScrollPerMS\":%.4f,\"nightVScrollPerMS\":%.4f,"
		"\"transparentWaterDepth\":%.3f,\"transparentWaterMinOpacity\":%.3f,"
		"\"additiveBlending\":%s},"
		"\"weather\":{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"source\":\"%s\",\"loadedArchives\":%s,\"fileExists\":%s,"
		"\"originalIniLoad\":%s,\"parsedFields\":%zu,"
		"\"snowTexture\":\"%s\",\"snowEnabled\":%s,\"pointSprites\":%s,"
		"\"snowBoxDimensions\":%.3f,\"snowBoxDensity\":%.3f,"
		"\"snowFrequencyScaleX\":%.4f,\"snowFrequencyScaleY\":%.4f,"
		"\"snowAmplitude\":%.3f,\"snowVelocity\":%.3f,"
		"\"snowPointSize\":%.3f,\"snowQuadSize\":%.3f,"
		"\"snowMaxPointSize\":%.3f,\"snowMinPointSize\":%.3f},"
		"\"video\":{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"defaultBytes\":%zu,\"source\":\"%s\",\"loadedArchives\":%s,"
		"\"fileExists\":%s,\"defaultFileExists\":%s,"
		"\"originalIniLoad\":%s,\"defaultOriginalIniLoad\":%s,"
		"\"shippedOriginalIniLoad\":%s,\"parsedFields\":%zu,"
		"\"videos\":%zu,\"firstInternalName\":\"%s\",\"firstFilename\":\"%s\","
		"\"sampleInternalName\":\"%s\",\"sampleFilename\":\"%s\"},"
		"\"mapCache\":{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"source\":\"%s\",\"loadedArchives\":%s,\"fileExists\":%s,"
		"\"gameTextLoaded\":%s,\"nameKeyGeneratorLoaded\":%s,"
		"\"originalIniLoad\":%s,\"maps\":%zu,\"multiplayerMaps\":%zu,"
		"\"officialMaps\":%zu,\"shellMapMD\":%s,\"tournamentDesert\":%s,"
		"\"shellMapMDDisplayName\":%s,\"tournamentDesertDisplayName\":%s,"
		"\"shellMapMDPlayers\":%d,\"tournamentDesertPlayers\":%d},"
		"\"gameText\":{\"attempted\":%s,\"ok\":%s,\"generalsCsf\":%s,"
		"\"titleLabel\":%s,\"controlBarLabel\":%s,\"controlBarLabels\":%zu}},"
		"\"archiveMount\":{\"registered\":%s,\"directory\":\"%s\","
		"\"fileMask\":\"%s\",\"archiveCount\":%d,\"totalBytes\":%.0f,"
		"\"bootProbe\":{\"attempted\":%s,\"ok\":%s,\"indexedFiles\":%zu}},"
		"\"startupAssets\":{\"ok\":%s,\"status\":\"%s\",\"message\":\"%s\","
		"\"archiveSetRegistered\":%s,\"bootProbeAttempted\":%s,\"bootProbeOk\":%s,"
		"\"required\":{\"inizh\":%s,\"armor\":%s,\"science\":%s,"
		"\"upgrade\":%s,\"commandButton\":%s,"
		"\"specialPower\":%s,\"playerTemplate\":%s,\"multiplayer\":%s,"
		"\"terrain\":%s,\"terrainRoads\":%s,"
		"\"gameData\":%s,\"water\":%s,\"weather\":%s,"
		"\"video\":%s,\"gameText\":%s,\"mapCache\":%s}},"
		"\"originalEngineLinked\":true,"
		"\"originalCoreProbe\":{\"source\":\"GameEngine/Common/RandomValue.cpp\","
		"\"seed\":%u,\"logicRandomValue\":%d,\"logicSeedCRC\":%u,\"ok\":%s},"
		"\"globalDataProbe\":{\"source\":\"%s\",\"attempted\":%s,\"ok\":%s,"
		"\"resolution\":{\"x\":%d,\"y\":%d},\"fpsLimit\":{\"enabled\":%s,\"frames\":%d},"
		"\"windowed\":%s,\"userDataPath\":\"%s\","
		"\"shellMap\":{\"enabled\":%s,\"name\":\"%s\"},"
		"\"defaults\":{\"useTrees\":%s,\"useTreeSway\":%s,\"useHeatEffects\":%s,"
		"\"maxParticleCount\":%d,\"maxFieldParticleCount\":%d,"
		"\"networkDisconnectTime\":%u,\"networkPlayerTimeoutTime\":%u,"
		"\"doubleClickTimeMs\":%u,\"exeCrc\":%u},"
		"\"setTimeOfDay\":{\"ok\":%s,\"value\":%d}},"
		"\"commandLineProbe\":{\"source\":\"%s\",\"attempted\":%s,\"ok\":%s,"
		"\"resolution\":{\"x\":%d,\"y\":%d},\"windowed\":%s,"
		"\"shellMapOn\":%s,\"playSizzle\":%s,\"animateWindows\":%s,"
		"\"scriptDebug\":%s,\"particleEdit\":%s,\"winCursors\":%s,"
		"\"playStats\":%d,\"chipSetType\":%d},"
		"\"cdManagerProbe\":{\"source\":\"%s\",\"attempted\":%s,\"ok\":%s,"
		"\"created\":%s,\"initialized\":%s,\"driveCount\":%d,"
		"\"noCdDrives\":%s},"
		"\"debugProbe\":{\"source\":\"WWVegas/WWDebug/wwdebug.cpp\","
		"\"handlersInstalled\":%s,\"ok\":%s,\"messageCount\":%d,"
		"\"information\":%d,\"warnings\":%d,\"errors\":%d,\"asserts\":%d,"
		"\"lastType\":\"%s\",\"lastMessage\":\"%s\",\"lastAssert\":\"%s\"},"
		"\"commonDebugLog\":{\"source\":\"GameEngine/Common/System/Debug.cpp\","
		"\"ok\":%s,\"logCount\":%d,\"flags\":%d,\"console\":%s,"
		"\"lastMessage\":\"%s\"}}",
		g_booted ? "true" : "false",
		g_frame,
		g_main_loop_running ? "true" : "false",
		EMSCRIPTEN_MAIN_LOOP_FPS,
		g_main_loop_ticks,
		g_timing_probe_ok ? "true" : "false",
		g_boot_time_ms,
		g_last_tick_time_ms,
		g_last_tick_delta_ms,
		g_win32_timing_probe_ok ? "true" : "false",
		g_qpc_frequency,
		g_boot_qpc,
		g_last_qpc,
		static_cast<unsigned long>(g_boot_time_get_time_ms),
		static_cast<unsigned long>(g_last_time_get_time_ms),
		static_cast<unsigned long>(g_boot_tick_count_ms),
		static_cast<unsigned long>(g_last_tick_count_ms),
		g_archive_probe.attempted ? "true" : "false",
		g_archive_probe.ok ? "true" : "false",
		g_archive_probe.loaded ? "true" : "false",
		archive_path_json.c_str(),
		g_archive_probe.indexed_file_count,
		g_archive_probe.sample_bytes,
		g_archive_probe.has_armor_ini ? "true" : "false",
		g_archive_probe.has_command_button_ini ? "true" : "false",
		g_archive_probe.has_player_template_ini ? "true" : "false",
		g_archive_probe.has_game_data_ini ? "true" : "false",
		g_archive_probe.has_science_ini ? "true" : "false",
		g_archive_probe.has_special_power_ini ? "true" : "false",
		g_archive_probe.has_multiplayer_ini ? "true" : "false",
		g_archive_probe.has_terrain_ini ? "true" : "false",
		g_archive_probe.has_roads_ini ? "true" : "false",
		g_archive_probe.has_upgrade_ini ? "true" : "false",
		g_archive_probe.has_water_ini ? "true" : "false",
		g_archive_probe.has_weather_ini ? "true" : "false",
		g_archive_probe.has_video_ini ? "true" : "false",
		g_archive_probe.has_default_video_ini ? "true" : "false",
		g_archive_probe.has_weapon_ini ? "true" : "false",
		g_archive_probe.has_map_cache_ini ? "true" : "false",
		g_archive_probe.armor_attempted ? "true" : "false",
		g_archive_probe.armor_ok ? "true" : "false",
		g_archive_probe.armor_bytes,
		armor_source_json.c_str(),
		g_archive_probe.armor_loaded_archives ? "true" : "false",
		g_archive_probe.armor_file_exists ? "true" : "false",
		g_archive_probe.armor_name_key_generator_loaded ? "true" : "false",
		g_archive_probe.armor_original_ini_load ? "true" : "false",
		g_archive_probe.armor_parsed_fields,
		g_archive_probe.armor_no_armor_found ? "true" : "false",
		g_archive_probe.armor_human_armor_found ? "true" : "false",
		g_archive_probe.armor_tank_armor_found ? "true" : "false",
		g_archive_probe.armor_no_armor_explosion_damage,
		g_archive_probe.armor_no_armor_hazard_cleanup_damage,
		g_archive_probe.armor_human_crush_damage,
		g_archive_probe.armor_human_armor_piercing_damage,
		g_archive_probe.armor_human_flame_damage,
		g_archive_probe.armor_tank_small_arms_damage,
		g_archive_probe.armor_tank_radiation_damage,
		g_archive_probe.armor_tank_microwave_damage,
		g_archive_probe.science_attempted ? "true" : "false",
		g_archive_probe.science_ok ? "true" : "false",
		g_archive_probe.science_bytes,
		science_source_json.c_str(),
		g_archive_probe.science_loaded_archives ? "true" : "false",
		g_archive_probe.science_file_exists ? "true" : "false",
		g_archive_probe.science_game_text_loaded ? "true" : "false",
		g_archive_probe.science_name_key_generator_loaded ? "true" : "false",
		g_archive_probe.science_original_ini_load ? "true" : "false",
		g_archive_probe.science_parsed_fields,
		g_archive_probe.science_count,
		g_archive_probe.science_america_found ? "true" : "false",
		g_archive_probe.science_rank3_found ? "true" : "false",
		g_archive_probe.science_paladin_found ? "true" : "false",
		g_archive_probe.science_paladin_name_loaded ? "true" : "false",
		g_archive_probe.science_paladin_description_loaded ? "true" : "false",
		g_archive_probe.science_america_purchase_cost,
		g_archive_probe.science_paladin_purchase_cost,
		g_archive_probe.science_america_grantable ? "true" : "false",
		g_archive_probe.science_paladin_grantable ? "true" : "false",
		upgrade_probe_json.c_str(),
		command_button_probe_json.c_str(),
		g_archive_probe.special_power_attempted ? "true" : "false",
		g_archive_probe.special_power_ok ? "true" : "false",
		g_archive_probe.special_power_bytes,
		g_archive_probe.special_power_science_bytes,
		special_power_source_json.c_str(),
		g_archive_probe.special_power_loaded_archives ? "true" : "false",
		g_archive_probe.special_power_file_exists ? "true" : "false",
		g_archive_probe.special_power_science_file_exists ? "true" : "false",
		g_archive_probe.special_power_game_text_loaded ? "true" : "false",
		g_archive_probe.special_power_name_key_generator_loaded ? "true" : "false",
		g_archive_probe.special_power_audio_manager_loaded ? "true" : "false",
		g_archive_probe.special_power_science_original_ini_load ? "true" : "false",
		g_archive_probe.special_power_original_ini_load ? "true" : "false",
		g_archive_probe.special_power_parsed_fields,
		g_archive_probe.special_power_count,
		g_archive_probe.special_power_daisy_cutter_found ? "true" : "false",
		g_archive_probe.special_power_daisy_cutter_enum,
		g_archive_probe.special_power_daisy_cutter_reload_frames,
		g_archive_probe.special_power_daisy_cutter_required_science_valid ? "true" : "false",
		special_power_daisy_cutter_required_science_json.c_str(),
		g_archive_probe.special_power_daisy_cutter_public_timer ? "true" : "false",
		g_archive_probe.special_power_daisy_cutter_shared_synced_timer ? "true" : "false",
		g_archive_probe.special_power_daisy_cutter_view_object_duration_frames,
		g_archive_probe.special_power_daisy_cutter_view_object_range,
		g_archive_probe.special_power_daisy_cutter_radius_cursor_radius,
		g_archive_probe.special_power_daisy_cutter_shortcut_power ? "true" : "false",
		g_archive_probe.special_power_daisy_cutter_academy_classification,
		g_archive_probe.special_power_carpet_bomb_found ? "true" : "false",
		g_archive_probe.special_power_carpet_bomb_enum,
		g_archive_probe.special_power_carpet_bomb_reload_frames,
		g_archive_probe.special_power_carpet_bomb_public_timer ? "true" : "false",
		g_archive_probe.special_power_carpet_bomb_shared_synced_timer ? "true" : "false",
		g_archive_probe.special_power_carpet_bomb_view_object_duration_frames,
		g_archive_probe.special_power_carpet_bomb_view_object_range,
		g_archive_probe.special_power_carpet_bomb_radius_cursor_radius,
		g_archive_probe.special_power_carpet_bomb_shortcut_power ? "true" : "false",
		g_archive_probe.special_power_carpet_bomb_academy_classification,
		g_archive_probe.special_power_crate_drop_found ? "true" : "false",
		g_archive_probe.special_power_crate_drop_enum,
		g_archive_probe.special_power_crate_drop_reload_frames,
		g_archive_probe.special_power_crate_drop_required_science_valid ? "true" : "false",
		special_power_crate_drop_required_science_json.c_str(),
		g_archive_probe.special_power_crate_drop_public_timer ? "true" : "false",
		g_archive_probe.special_power_crate_drop_shared_synced_timer ? "true" : "false",
		g_archive_probe.special_power_crate_drop_view_object_duration_frames,
		g_archive_probe.special_power_crate_drop_view_object_range,
		g_archive_probe.special_power_crate_drop_radius_cursor_radius,
		g_archive_probe.special_power_crate_drop_shortcut_power ? "true" : "false",
		g_archive_probe.special_power_neutron_missile_found ? "true" : "false",
		special_power_neutron_sound_json.c_str(),
		g_archive_probe.special_power_scud_storm_found ? "true" : "false",
		special_power_scud_sound_json.c_str(),
		g_archive_probe.player_template_attempted ? "true" : "false",
		g_archive_probe.player_template_ok ? "true" : "false",
		g_archive_probe.player_template_bytes,
		g_archive_probe.player_template_science_bytes,
		player_template_source_json.c_str(),
		g_archive_probe.player_template_loaded_archives ? "true" : "false",
		g_archive_probe.player_template_file_exists ? "true" : "false",
		g_archive_probe.player_template_science_file_exists ? "true" : "false",
		g_archive_probe.player_template_game_text_loaded ? "true" : "false",
		g_archive_probe.player_template_name_key_generator_loaded ? "true" : "false",
		g_archive_probe.player_template_science_original_ini_load ? "true" : "false",
		g_archive_probe.player_template_original_ini_load ? "true" : "false",
		g_archive_probe.player_template_parsed_fields,
		g_archive_probe.player_template_count,
		g_archive_probe.player_template_side_count,
		g_archive_probe.player_template_america_found ? "true" : "false",
		g_archive_probe.player_template_china_found ? "true" : "false",
		g_archive_probe.player_template_gla_found ? "true" : "false",
		g_archive_probe.player_template_observer_found ? "true" : "false",
		g_archive_probe.player_template_air_force_found ? "true" : "false",
		g_archive_probe.player_template_boss_found ? "true" : "false",
		g_archive_probe.player_template_america_display_name_loaded ? "true" : "false",
		player_template_america_side_json.c_str(),
		player_template_america_base_side_json.c_str(),
		g_archive_probe.player_template_america_playable ? "true" : "false",
		g_archive_probe.player_template_america_old_faction ? "true" : "false",
		g_archive_probe.player_template_america_start_money,
		g_archive_probe.player_template_america_intrinsic_science_count,
		g_archive_probe.player_template_america_intrinsic_science_valid ? "true" : "false",
		player_template_america_starting_building_json.c_str(),
		player_template_america_starting_unit0_json.c_str(),
		player_template_america_shortcut_command_set_json.c_str(),
		player_template_america_shortcut_win_name_json.c_str(),
		g_archive_probe.player_template_america_shortcut_button_count,
		player_template_america_load_screen_json.c_str(),
		player_template_america_score_screen_json.c_str(),
		player_template_america_load_music_json.c_str(),
		player_template_america_score_music_json.c_str(),
		player_template_america_beacon_json.c_str(),
		g_archive_probe.player_template_observer_is_observer ? "true" : "false",
		g_archive_probe.player_template_observer_playable ? "true" : "false",
		player_template_observer_side_json.c_str(),
		player_template_observer_load_screen_json.c_str(),
		player_template_observer_beacon_json.c_str(),
		player_template_air_force_side_json.c_str(),
		player_template_air_force_base_side_json.c_str(),
		g_archive_probe.player_template_air_force_playable ? "true" : "false",
		g_archive_probe.player_template_air_force_old_faction ? "true" : "false",
		player_template_air_force_starting_building_json.c_str(),
		player_template_air_force_starting_unit0_json.c_str(),
		player_template_air_force_shortcut_command_set_json.c_str(),
		g_archive_probe.player_template_air_force_shortcut_button_count,
		player_template_boss_side_json.c_str(),
		player_template_boss_base_side_json.c_str(),
		g_archive_probe.player_template_boss_playable ? "true" : "false",
		g_archive_probe.player_template_boss_old_faction ? "true" : "false",
		g_archive_probe.player_template_boss_intrinsic_science_count,
		g_archive_probe.player_template_boss_intrinsic_sciences_valid ? "true" : "false",
		player_template_boss_starting_building_json.c_str(),
		player_template_boss_starting_unit0_json.c_str(),
		player_template_boss_shortcut_command_set_json.c_str(),
		player_template_boss_shortcut_win_name_json.c_str(),
		g_archive_probe.player_template_boss_shortcut_button_count,
		g_archive_probe.game_data_attempted ? "true" : "false",
		g_archive_probe.game_data_ok ? "true" : "false",
		g_archive_probe.game_data_bytes,
		game_data_source_json.c_str(),
		g_archive_probe.game_data_loaded_archives ? "true" : "false",
		g_archive_probe.game_data_file_exists ? "true" : "false",
		g_archive_probe.game_data_original_ini_load ? "true" : "false",
		g_archive_probe.game_data_parsed_fields,
		game_data_shell_map_name_json.c_str(),
		g_archive_probe.game_data_use_fps_limit ? "true" : "false",
		g_archive_probe.game_data_frames_per_second_limit,
		g_archive_probe.game_data_max_shell_screens,
		g_archive_probe.game_data_use_cloud_map ? "true" : "false",
		g_archive_probe.game_data_default_structure_rubble_height,
		g_archive_probe.game_data_group_select_volume_base,
		g_archive_probe.game_data_max_particle_count,
		g_archive_probe.multiplayer_attempted ? "true" : "false",
		g_archive_probe.multiplayer_ok ? "true" : "false",
		g_archive_probe.multiplayer_bytes,
		multiplayer_source_json.c_str(),
		g_archive_probe.multiplayer_loaded_archives ? "true" : "false",
		g_archive_probe.multiplayer_file_exists ? "true" : "false",
		g_archive_probe.multiplayer_original_ini_load ? "true" : "false",
		g_archive_probe.multiplayer_parsed_fields,
		g_archive_probe.multiplayer_color_count,
		g_archive_probe.multiplayer_starting_money_count,
		g_archive_probe.multiplayer_start_countdown_seconds,
		g_archive_probe.multiplayer_max_beacons_per_player,
		g_archive_probe.multiplayer_use_shroud ? "true" : "false",
		g_archive_probe.multiplayer_show_random_player_template ? "true" : "false",
		g_archive_probe.multiplayer_show_random_start_pos ? "true" : "false",
		g_archive_probe.multiplayer_show_random_color ? "true" : "false",
		g_archive_probe.multiplayer_gold_color_found ? "true" : "false",
		g_archive_probe.multiplayer_purple_color_found ? "true" : "false",
		g_archive_probe.multiplayer_gold_color,
		g_archive_probe.multiplayer_purple_night_color,
		g_archive_probe.multiplayer_chat_default_color,
		g_archive_probe.multiplayer_chat_game_color,
		g_archive_probe.multiplayer_chat_player_normal_color,
		g_archive_probe.multiplayer_chat_self_color,
		g_archive_probe.multiplayer_chat_map_selected_color,
		g_archive_probe.multiplayer_starting_money_first,
		g_archive_probe.multiplayer_starting_money_second,
		g_archive_probe.multiplayer_starting_money_third,
		g_archive_probe.multiplayer_starting_money_fourth,
		g_archive_probe.multiplayer_default_starting_money,
		g_archive_probe.terrain_attempted ? "true" : "false",
		g_archive_probe.terrain_ok ? "true" : "false",
		g_archive_probe.terrain_bytes,
		terrain_source_json.c_str(),
		g_archive_probe.terrain_loaded_archives ? "true" : "false",
		g_archive_probe.terrain_file_exists ? "true" : "false",
		g_archive_probe.terrain_original_ini_load ? "true" : "false",
		g_archive_probe.terrain_parsed_fields,
		g_archive_probe.terrain_count,
		g_archive_probe.terrain_transition_found ? "true" : "false",
		g_archive_probe.terrain_asphalt_found ? "true" : "false",
		g_archive_probe.terrain_desert_dry_found ? "true" : "false",
		g_archive_probe.terrain_beach_tropical_found ? "true" : "false",
		g_archive_probe.terrain_snow_flat_found ? "true" : "false",
		terrain_transition_texture_json.c_str(),
		terrain_asphalt_texture_json.c_str(),
		terrain_desert_dry_texture_json.c_str(),
		terrain_beach_tropical_texture_json.c_str(),
		terrain_snow_flat_texture_json.c_str(),
		g_archive_probe.terrain_transition_class,
		g_archive_probe.terrain_asphalt_class,
		g_archive_probe.terrain_desert_dry_class,
		g_archive_probe.terrain_beach_tropical_class,
		g_archive_probe.terrain_snow_flat_class,
		g_archive_probe.terrain_asphalt_blend_edges ? "true" : "false",
		g_archive_probe.terrain_asphalt_restrict_construction ? "true" : "false",
		g_archive_probe.terrain_roads_attempted ? "true" : "false",
		g_archive_probe.terrain_roads_ok ? "true" : "false",
		g_archive_probe.terrain_roads_bytes,
		terrain_roads_source_json.c_str(),
		g_archive_probe.terrain_roads_loaded_archives ? "true" : "false",
		g_archive_probe.terrain_roads_file_exists ? "true" : "false",
		g_archive_probe.terrain_roads_original_ini_load ? "true" : "false",
		g_archive_probe.terrain_roads_parsed_fields,
		g_archive_probe.terrain_roads_road_count,
		g_archive_probe.terrain_roads_bridge_count,
		g_archive_probe.terrain_roads_two_lane_found ? "true" : "false",
		g_archive_probe.terrain_roads_four_lane_found ? "true" : "false",
		g_archive_probe.terrain_roads_dirt_road_found ? "true" : "false",
		g_archive_probe.terrain_roads_concrete_bridge_found ? "true" : "false",
		terrain_roads_two_lane_texture_json.c_str(),
		terrain_roads_four_lane_texture_json.c_str(),
		terrain_roads_dirt_road_texture_json.c_str(),
		terrain_roads_concrete_bridge_texture_json.c_str(),
		terrain_roads_concrete_bridge_model_json.c_str(),
		terrain_roads_concrete_bridge_damaged_texture_json.c_str(),
		terrain_roads_concrete_bridge_scaffold_json.c_str(),
		terrain_roads_concrete_bridge_tower_left_json.c_str(),
		terrain_roads_concrete_bridge_damage_sound_json.c_str(),
		terrain_roads_concrete_bridge_repaired_sound_json.c_str(),
		terrain_roads_concrete_bridge_damage_ocl_json.c_str(),
		terrain_roads_concrete_bridge_damage_fx_json.c_str(),
		terrain_roads_concrete_bridge_repair_fx_json.c_str(),
		g_archive_probe.terrain_roads_two_lane_width,
		g_archive_probe.terrain_roads_two_lane_width_in_texture,
		g_archive_probe.terrain_roads_four_lane_width,
		g_archive_probe.terrain_roads_dirt_road_width,
		g_archive_probe.terrain_roads_dirt_road_width_in_texture,
		g_archive_probe.terrain_roads_concrete_bridge_scale,
		g_archive_probe.terrain_roads_concrete_bridge_radar_red,
		g_archive_probe.terrain_roads_concrete_bridge_radar_green,
		g_archive_probe.terrain_roads_concrete_bridge_radar_blue,
		g_archive_probe.terrain_roads_concrete_bridge_transition_effects_height,
		g_archive_probe.terrain_roads_concrete_bridge_num_fx_per_type,
		g_archive_probe.water_attempted ? "true" : "false",
		g_archive_probe.water_ok ? "true" : "false",
		g_archive_probe.water_bytes,
		water_source_json.c_str(),
		g_archive_probe.water_loaded_archives ? "true" : "false",
		g_archive_probe.water_file_exists ? "true" : "false",
		g_archive_probe.water_original_ini_load ? "true" : "false",
		g_archive_probe.water_parsed_fields,
		g_archive_probe.water_set_count,
		g_archive_probe.water_transparency_loaded ? "true" : "false",
		water_morning_sky_texture_json.c_str(),
		water_morning_water_texture_json.c_str(),
		water_night_sky_texture_json.c_str(),
		water_night_water_texture_json.c_str(),
		water_standing_water_texture_json.c_str(),
		g_archive_probe.water_morning_repeat_count,
		g_archive_probe.water_night_repeat_count,
		g_archive_probe.water_morning_sky_texels_per_unit,
		g_archive_probe.water_night_sky_texels_per_unit,
		g_archive_probe.water_morning_u_scroll_per_ms,
		g_archive_probe.water_morning_v_scroll_per_ms,
		g_archive_probe.water_night_u_scroll_per_ms,
		g_archive_probe.water_night_v_scroll_per_ms,
		g_archive_probe.water_transparent_depth,
		g_archive_probe.water_transparent_min_opacity,
		g_archive_probe.water_additive_blending ? "true" : "false",
		g_archive_probe.weather_attempted ? "true" : "false",
		g_archive_probe.weather_ok ? "true" : "false",
		g_archive_probe.weather_bytes,
		weather_source_json.c_str(),
		g_archive_probe.weather_loaded_archives ? "true" : "false",
		g_archive_probe.weather_file_exists ? "true" : "false",
		g_archive_probe.weather_original_ini_load ? "true" : "false",
		g_archive_probe.weather_parsed_fields,
		weather_snow_texture_json.c_str(),
		g_archive_probe.weather_snow_enabled ? "true" : "false",
		g_archive_probe.weather_use_point_sprites ? "true" : "false",
		g_archive_probe.weather_snow_box_dimensions,
		g_archive_probe.weather_snow_box_density,
		g_archive_probe.weather_snow_frequency_scale_x,
		g_archive_probe.weather_snow_frequency_scale_y,
		g_archive_probe.weather_snow_amplitude,
		g_archive_probe.weather_snow_velocity,
		g_archive_probe.weather_snow_point_size,
		g_archive_probe.weather_snow_quad_size,
		g_archive_probe.weather_snow_max_point_size,
		g_archive_probe.weather_snow_min_point_size,
		g_archive_probe.video_attempted ? "true" : "false",
		g_archive_probe.video_ok ? "true" : "false",
		g_archive_probe.video_bytes,
		g_archive_probe.video_default_bytes,
		video_source_json.c_str(),
		g_archive_probe.video_loaded_archives ? "true" : "false",
		g_archive_probe.video_file_exists ? "true" : "false",
		g_archive_probe.video_default_file_exists ? "true" : "false",
		g_archive_probe.video_original_ini_load ? "true" : "false",
		g_archive_probe.video_default_original_ini_load ? "true" : "false",
		g_archive_probe.video_shipped_original_ini_load ? "true" : "false",
		g_archive_probe.video_parsed_fields,
		g_archive_probe.video_count,
		video_first_internal_name_json.c_str(),
		video_first_filename_json.c_str(),
		video_sample_internal_name_json.c_str(),
		video_sample_filename_json.c_str(),
		g_archive_probe.map_cache_attempted ? "true" : "false",
		g_archive_probe.map_cache_ok ? "true" : "false",
		g_archive_probe.map_cache_bytes,
		map_cache_source_json.c_str(),
		g_archive_probe.map_cache_loaded_archives ? "true" : "false",
		g_archive_probe.map_cache_file_exists ? "true" : "false",
		g_archive_probe.map_cache_game_text_loaded ? "true" : "false",
		g_archive_probe.map_cache_name_key_generator_loaded ? "true" : "false",
		g_archive_probe.map_cache_original_ini_load ? "true" : "false",
		g_archive_probe.map_cache_maps,
		g_archive_probe.map_cache_multiplayer_maps,
		g_archive_probe.map_cache_official_maps,
		g_archive_probe.map_cache_has_shell_map_md ? "true" : "false",
		g_archive_probe.map_cache_has_tournament_desert ? "true" : "false",
		g_archive_probe.map_cache_shell_map_md_display_name ? "true" : "false",
		g_archive_probe.map_cache_tournament_desert_display_name ? "true" : "false",
		g_archive_probe.map_cache_shell_map_md_players,
		g_archive_probe.map_cache_tournament_desert_players,
		g_archive_probe.game_text_attempted ? "true" : "false",
		g_archive_probe.game_text_ok ? "true" : "false",
		g_archive_probe.has_generals_csf ? "true" : "false",
		g_archive_probe.game_text_title_label ? "true" : "false",
		g_archive_probe.game_text_control_bar_label ? "true" : "false",
		g_archive_probe.game_text_control_bar_label_count,
		g_archive_mount.registered ? "true" : "false",
		archive_mount_directory_json.c_str(),
		archive_mount_file_mask_json.c_str(),
		g_archive_mount.archive_count,
		g_archive_mount.total_bytes,
		g_archive_mount.boot_probe_attempted ? "true" : "false",
		g_archive_mount.boot_probe_ok ? "true" : "false",
		g_archive_mount.boot_probe_indexed_file_count,
		startup_assets_ready() ? "true" : "false",
		startup_asset_status_json.c_str(),
		startup_asset_message_json.c_str(),
		g_archive_mount.registered ? "true" : "false",
		g_archive_mount.boot_probe_attempted ? "true" : "false",
		g_archive_mount.boot_probe_ok ? "true" : "false",
		startup_boot_ini_present() ? "true" : "false",
		startup_armor_ready() ? "true" : "false",
		startup_science_ready() ? "true" : "false",
		startup_upgrade_ready() ? "true" : "false",
		startup_command_button_ready() ? "true" : "false",
		startup_special_power_ready() ? "true" : "false",
		startup_player_template_ready() ? "true" : "false",
		startup_multiplayer_ready() ? "true" : "false",
		startup_terrain_ready() ? "true" : "false",
		startup_terrain_roads_ready() ? "true" : "false",
		startup_game_data_ready() ? "true" : "false",
		startup_water_ready() ? "true" : "false",
		startup_weather_ready() ? "true" : "false",
		startup_video_ready() ? "true" : "false",
		startup_game_text_ready() ? "true" : "false",
		startup_map_cache_ready() ? "true" : "false",
		ORIGINAL_CORE_PROBE_SEED,
		g_original_logic_random_value,
		g_original_logic_seed_crc,
		g_original_core_probe_ok ? "true" : "false",
		global_data_source_json.c_str(),
		g_global_data_probe.attempted ? "true" : "false",
		g_global_data_probe.ok ? "true" : "false",
		g_global_data_probe.x_resolution,
		g_global_data_probe.y_resolution,
		g_global_data_probe.use_fps_limit ? "true" : "false",
		g_global_data_probe.frames_per_second_limit,
		g_global_data_probe.windowed ? "true" : "false",
		global_data_user_data_path_json.c_str(),
		g_global_data_probe.shell_map_on ? "true" : "false",
		global_data_shell_map_name_json.c_str(),
		g_global_data_probe.use_trees ? "true" : "false",
		g_global_data_probe.use_tree_sway ? "true" : "false",
		g_global_data_probe.use_heat_effects ? "true" : "false",
		g_global_data_probe.max_particle_count,
		g_global_data_probe.max_field_particle_count,
		g_global_data_probe.network_disconnect_time,
		g_global_data_probe.network_player_timeout_time,
		g_global_data_probe.double_click_time_ms,
		g_global_data_probe.exe_crc,
		g_global_data_probe.set_time_of_day_ok ? "true" : "false",
		g_global_data_probe.time_of_day,
		command_line_source_json.c_str(),
		g_command_line_probe.attempted ? "true" : "false",
		g_command_line_probe.ok ? "true" : "false",
		g_command_line_probe.x_resolution,
		g_command_line_probe.y_resolution,
		g_command_line_probe.windowed ? "true" : "false",
		g_command_line_probe.shell_map_on ? "true" : "false",
		g_command_line_probe.play_sizzle ? "true" : "false",
		g_command_line_probe.animate_windows ? "true" : "false",
		g_command_line_probe.script_debug ? "true" : "false",
		g_command_line_probe.particle_edit ? "true" : "false",
		g_command_line_probe.win_cursors ? "true" : "false",
		g_command_line_probe.play_stats,
		g_command_line_probe.chip_set_type,
		cd_manager_source_json.c_str(),
		g_cd_manager_probe.attempted ? "true" : "false",
		g_cd_manager_probe.ok ? "true" : "false",
		g_cd_manager_probe.created ? "true" : "false",
		g_cd_manager_probe.initialized ? "true" : "false",
		g_cd_manager_probe.drive_count,
		g_cd_manager_probe.no_cd_drives ? "true" : "false",
		g_debug_handlers_installed ? "true" : "false",
		g_debug_probe_ok ? "true" : "false",
		g_debug_message_count,
		g_debug_information_count,
		g_debug_warning_count,
		g_debug_error_count,
		g_debug_assert_count,
		debug_last_type_json.c_str(),
		debug_last_message_json.c_str(),
		debug_last_assert_json.c_str(),
		g_common_debug_log_probe_ok ? "true" : "false",
		g_common_debug_log_count,
		g_common_debug_log_flags,
		(g_common_debug_log_flags & DEBUG_FLAG_LOG_TO_CONSOLE) != 0 ? "true" : "false",
		common_debug_log_last_message_json.c_str());
	g_state_json = buffer;
	return g_state_json.c_str();
}
}

extern "C" {

EMSCRIPTEN_KEEPALIVE const char *cnc_port_boot()
{
	ensure_booted();
	return write_state_json();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_frame()
{
	tick_frame();
	return write_state_json();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_start_main_loop()
{
	ensure_booted();
	g_main_loop_running = true;
#ifdef __EMSCRIPTEN__
	emscripten_set_main_loop(main_loop_tick, EMSCRIPTEN_MAIN_LOOP_FPS, 0);
#endif
	return write_state_json();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_stop_main_loop()
{
#ifdef __EMSCRIPTEN__
	emscripten_cancel_main_loop();
#endif
	g_main_loop_running = false;
	return write_state_json();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_archive(const char *archive_path)
{
	g_archive_probe = probe_original_archive(archive_path);
	std::printf("cnc-port: archive probe path=%s ok=%d indexed=%zu\n",
		archive_path != nullptr ? archive_path : "",
		g_archive_probe.ok ? 1 : 0,
		g_archive_probe.indexed_file_count);
	return write_state_json();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_register_archive_set(
	const char *archive_directory,
	const char *archive_file_mask,
	int archive_count,
	double total_bytes)
{
	g_archive_mount.registered = true;
	g_archive_mount.directory = archive_directory != nullptr ? archive_directory : "";
	g_archive_mount.file_mask = archive_file_mask != nullptr ? archive_file_mask : "";
	g_archive_mount.archive_count = archive_count < 0 ? 0 : archive_count;
	g_archive_mount.total_bytes = total_bytes < 0.0 ? 0.0 : total_bytes;
	g_archive_mount.boot_probe_attempted = false;
	g_archive_mount.boot_probe_ok = false;
	g_archive_mount.boot_probe_indexed_file_count = 0;
	std::printf("cnc-port: archive set directory=%s mask=%s count=%d bytes=%.0f\n",
		g_archive_mount.directory.c_str(),
		g_archive_mount.file_mask.c_str(),
		g_archive_mount.archive_count,
		g_archive_mount.total_bytes);
	return write_state_json();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_state()
{
	return write_state_json();
}

}
