#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>

#include "wasm_archive_probe.h"
#include "wasm_browser_runtime_assets.h"
#include "wasm_cdmanager_probe.h"
#include "wasm_filesystem_probe.h"
#include "wasm_gamenetwork_probe.h"
#include "wasm_globaldata_probe.h"
#include "wasm_d3d8_shim.h"

#include "D3dx8core.h"
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

extern HWND ApplicationHWnd;

extern "C" void cnc_port_update_original_keyboard_frame_input();
extern "C" const char *cnc_port_probe_original_keyboard_frame_input();
extern "C" void cnc_port_update_original_mouse_frame_input();

void cnc_port_service_original_wndproc_messages();

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
FileSystemProbeResult g_file_system_probe;
GameNetworkProbeResult g_game_network_probe;
std::string g_state_json;
std::string g_input_probe_json;
std::string g_d3d8_probe_json;

DWORD d3d8_float_bits(float value)
{
	DWORD bits = 0;
	std::memcpy(&bits, &value, sizeof(bits));
	return bits;
}

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

void run_original_file_system_probe()
{
	const char *archive_directory = g_archive_mount.registered
		? g_archive_mount.directory.c_str()
		: nullptr;
	const char *archive_file_mask = g_archive_mount.registered
		? g_archive_mount.file_mask.c_str()
		: nullptr;
	g_file_system_probe = probe_original_file_system(archive_directory, archive_file_mask);
	std::printf("cnc-port: filesystem probe ok=%d local=%d archive=%d\n",
		g_file_system_probe.ok ? 1 : 0,
		g_file_system_probe.local_ok ? 1 : 0,
		g_file_system_probe.archive_attempted ? (g_file_system_probe.archive_ok ? 1 : 0) : -1);
}

void run_original_game_network_probe()
{
	g_game_network_probe = probe_original_game_network();
	std::printf("cnc-port: gamenetwork probe ok=%d packetLength=%d\n",
		g_game_network_probe.ok ? 1 : 0,
		g_game_network_probe.packet_length);
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
		g_archive_probe.has_damage_fx_ini &&
		g_archive_probe.has_fx_list_ini &&
		g_archive_probe.has_object_creation_list_ini &&
		g_archive_probe.has_default_ai_data_ini &&
		g_archive_probe.has_locomotor_ini &&
		g_archive_probe.has_command_button_ini &&
		g_archive_probe.has_command_set_ini &&
		g_archive_probe.has_control_bar_scheme_ini &&
		g_archive_probe.has_default_control_bar_scheme_ini &&
		g_archive_probe.has_game_data_ini &&
		g_archive_probe.has_terrain_ini &&
		g_archive_probe.has_roads_ini &&
		g_archive_probe.has_upgrade_ini &&
		g_archive_probe.has_weapon_ini &&
		g_archive_probe.has_particle_system_ini;
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

bool startup_damage_fx_ready()
{
	return g_archive_probe.has_damage_fx_ini &&
		g_archive_probe.damage_fx_attempted &&
		g_archive_probe.damage_fx_ok;
}

bool startup_fx_list_ready()
{
	return g_archive_probe.has_fx_list_ini &&
		g_archive_probe.fx_list_attempted &&
		g_archive_probe.fx_list_ok;
}

bool startup_object_creation_list_ready()
{
	return g_archive_probe.has_object_creation_list_ini &&
		g_archive_probe.has_fx_list_ini &&
		g_archive_probe.has_weapon_ini &&
		g_archive_probe.has_particle_system_ini &&
		g_archive_probe.object_creation_list_attempted &&
		g_archive_probe.object_creation_list_ok;
}

bool startup_weapon_ready()
{
	return g_archive_probe.has_weapon_ini &&
		g_archive_probe.has_particle_system_ini &&
		g_archive_probe.weapon_attempted &&
		g_archive_probe.weapon_ok;
}

bool startup_ai_data_ready()
{
	return g_archive_probe.has_default_ai_data_ini &&
		g_archive_probe.has_science_ini &&
		g_archive_probe.ai_data_attempted &&
		g_archive_probe.ai_data_ok;
}

bool startup_locomotor_ready()
{
	return g_archive_probe.has_locomotor_ini &&
		g_archive_probe.locomotor_attempted &&
		g_archive_probe.locomotor_ok;
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

bool startup_command_set_ready()
{
	return g_archive_probe.has_command_set_ini &&
		g_archive_probe.command_set_attempted &&
		g_archive_probe.command_set_ok;
}

bool startup_control_bar_scheme_ready()
{
	return g_archive_probe.has_control_bar_scheme_ini &&
		g_archive_probe.has_default_control_bar_scheme_ini &&
		g_archive_probe.control_bar_scheme_attempted &&
		g_archive_probe.control_bar_scheme_ok;
}

bool startup_crate_ready()
{
	return g_archive_probe.has_crate_ini &&
		g_archive_probe.crate_attempted &&
		g_archive_probe.crate_ok;
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

bool startup_data_probes_ready()
{
	return g_archive_probe.ok &&
		startup_archive_probe_loaded() &&
		startup_boot_ini_present() &&
		startup_armor_ready() &&
		startup_damage_fx_ready() &&
		startup_fx_list_ready() &&
		startup_object_creation_list_ready() &&
		startup_weapon_ready() &&
		startup_ai_data_ready() &&
		startup_locomotor_ready() &&
		startup_science_ready() &&
		startup_special_power_ready() &&
		startup_player_template_ready() &&
		startup_multiplayer_ready() &&
		startup_terrain_ready() &&
		startup_terrain_roads_ready() &&
		startup_upgrade_ready() &&
		startup_command_button_ready() &&
		startup_command_set_ready() &&
		startup_control_bar_scheme_ready() &&
		startup_crate_ready() &&
		startup_game_data_ready() &&
		startup_water_ready() &&
		startup_weather_ready() &&
		startup_video_ready() &&
		startup_game_text_ready() &&
		startup_map_cache_ready();
}

bool startup_assets_ready()
{
	return g_archive_mount.registered &&
		g_archive_mount.boot_probe_attempted &&
		g_archive_mount.boot_probe_ok &&
		startup_data_probes_ready();
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
	if (!startup_damage_fx_ready()) {
		return "damage_fx_probe_failed";
	}
	if (!startup_fx_list_ready()) {
		return "fx_list_probe_failed";
	}
	if (!startup_object_creation_list_ready()) {
		return "object_creation_list_probe_failed";
	}
	if (!startup_weapon_ready()) {
		return "weapon_probe_failed";
	}
	if (!startup_ai_data_ready()) {
		return "ai_data_probe_failed";
	}
	if (!startup_locomotor_ready()) {
		return "locomotor_probe_failed";
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
	if (!startup_command_set_ready()) {
		return "command_set_probe_failed";
	}
	if (!startup_control_bar_scheme_ready()) {
		return "control_bar_scheme_probe_failed";
	}
	if (!startup_crate_ready()) {
		return "crate_probe_failed";
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
	if (!startup_damage_fx_ready()) {
		return "Runtime BIG archive set did not pass the DamageFX.ini startup probe.";
	}
	if (!startup_fx_list_ready()) {
		return "Runtime BIG archive set did not pass the FXList.ini startup probe.";
	}
	if (!startup_object_creation_list_ready()) {
		return "Runtime BIG archive set did not pass the ObjectCreationList.ini startup probe.";
	}
	if (!startup_weapon_ready()) {
		return "Runtime BIG archive set did not pass the Weapon.ini startup probe.";
	}
	if (!startup_ai_data_ready()) {
		return "Runtime BIG archive set did not pass the AIData.ini startup probe.";
	}
	if (!startup_locomotor_ready()) {
		return "Runtime BIG archive set did not pass the Locomotor.ini startup probe.";
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
	if (!startup_command_set_ready()) {
		return "Runtime BIG archive set did not pass the CommandSet.ini startup probe.";
	}
	if (!startup_control_bar_scheme_ready()) {
		return "Runtime BIG archive set did not pass the ControlBarScheme.ini startup probe.";
	}
	if (!startup_crate_ready()) {
		return "Runtime BIG archive set did not pass the Crate.ini startup probe.";
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
	return "Runtime BIG archive set passed the bootstrap startup asset preflight.";
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

std::string build_browser_input_json()
{
	char buffer[2200];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"browser_win32_input_shim\","
		"\"cursor\":{\"available\":%s,\"x\":%ld,\"y\":%ld},"
		"\"cursorSet\":%s,\"capture\":%s,"
		"\"messageQueue\":{\"count\":%u,\"overflowed\":%s},"
		"\"keyboardMessageQueue\":{\"count\":%u,\"overflowed\":%s},"
		"\"keys\":{\"f5\":{\"down\":%s,\"pressedSinceLastQuery\":%s},"
		"\"f6\":{\"down\":%s,\"pressedSinceLastQuery\":%s},"
		"\"f7\":{\"down\":%s,\"pressedSinceLastQuery\":%s},"
		"\"f8\":{\"down\":%s,\"pressedSinceLastQuery\":%s},"
		"\"insert\":{\"down\":%s,\"pressedSinceLastQuery\":%s},"
		"\"delete\":{\"down\":%s,\"pressedSinceLastQuery\":%s}}}",
		WasmWin32Input::cursor_position_available ? "true" : "false",
		WasmWin32Input::cursor_position.x,
		WasmWin32Input::cursor_position.y,
		WasmWin32Input::current_cursor != nullptr ? "true" : "false",
		WasmWin32Input::capture_window != nullptr ? "true" : "false",
		WasmWin32Input::message_queue_count,
		WasmWin32Input::message_queue_overflowed ? "true" : "false",
		WasmWin32Input::keyboard_message_queue_count,
		WasmWin32Input::keyboard_message_queue_overflowed ? "true" : "false",
		WasmWin32Input::key_down[VK_F5] ? "true" : "false",
		WasmWin32Input::key_pressed_since_last_query[VK_F5] ? "true" : "false",
		WasmWin32Input::key_down[VK_F6] ? "true" : "false",
		WasmWin32Input::key_pressed_since_last_query[VK_F6] ? "true" : "false",
		WasmWin32Input::key_down[VK_F7] ? "true" : "false",
		WasmWin32Input::key_pressed_since_last_query[VK_F7] ? "true" : "false",
		WasmWin32Input::key_down[VK_F8] ? "true" : "false",
		WasmWin32Input::key_pressed_since_last_query[VK_F8] ? "true" : "false",
		WasmWin32Input::key_down[VK_INSERT] ? "true" : "false",
		WasmWin32Input::key_pressed_since_last_query[VK_INSERT] ? "true" : "false",
		WasmWin32Input::key_down[VK_DELETE] ? "true" : "false",
		WasmWin32Input::key_pressed_since_last_query[VK_DELETE] ? "true" : "false");
	return buffer;
}

std::string build_win32_message_json(const MSG &message)
{
	char buffer[500];
	std::snprintf(buffer, sizeof(buffer),
		"{\"message\":%u,\"wParam\":%u,\"lParam\":%d,"
		"\"time\":%lu,\"pt\":{\"x\":%ld,\"y\":%ld}}",
		message.message,
		static_cast<unsigned int>(message.wParam),
		static_cast<int>(message.lParam),
		static_cast<unsigned long>(message.time),
		message.pt.x,
		message.pt.y);
	return buffer;
}

std::string build_data_summary_json()
{
	char buffer[8200];
	const std::string game_text_language_json =
		json_escape(g_archive_probe.game_text_language);
	const std::string game_text_csf_path_json =
		json_escape(g_archive_probe.game_text_csf_path);
	std::snprintf(buffer, sizeof(buffer),
		"{\"ok\":%s,\"startupReady\":%s,\"source\":\"assetProbe\","
		"\"archives\":{\"indexedFiles\":%zu,\"sampleBytes\":%zu},"
		"\"parsers\":{\"armor\":%s,\"damageFX\":%s,\"fxList\":%s,"
		"\"objectCreationList\":%s,\"weapon\":%s,\"aiData\":%s,"
		"\"locomotor\":%s,\"science\":%s,\"upgrade\":%s,"
		"\"commandButton\":%s,\"commandSet\":%s,\"controlBarScheme\":%s,"
		"\"crate\":%s,\"drawGroupInfo\":%s,\"mappedImages\":%s,"
		"\"challengeMode\":%s,"
		"\"specialPower\":%s,\"playerTemplate\":%s,\"multiplayer\":%s,"
		"\"terrain\":%s,\"terrainRoads\":%s,\"gameData\":%s,"
		"\"water\":%s,\"weather\":%s,\"video\":%s,\"gameText\":%s,"
		"\"mapCache\":%s},"
		"\"parsedFields\":{\"armor\":%zu,\"damageFX\":%zu,\"fxList\":%zu,"
		"\"objectCreationList\":%zu,\"weapon\":%zu,\"aiData\":%zu,"
		"\"locomotor\":%zu,\"science\":%zu,\"upgrade\":%zu,"
		"\"commandButton\":%zu,\"commandSet\":%zu,\"controlBarScheme\":%zu,"
		"\"crate\":%zu,\"drawGroupInfo\":%zu,\"mappedImages\":%zu,"
		"\"challengeMode\":%zu,"
		"\"specialPower\":%zu,\"playerTemplate\":%zu,\"multiplayer\":%zu,"
		"\"terrain\":%zu,\"terrainRoads\":%zu,\"gameData\":%zu,"
		"\"water\":%zu,\"weather\":%zu,\"video\":%zu},"
		"\"templates\":{\"fxLists\":%zu,\"objectCreationLists\":%zu,"
		"\"objectCreationNuggets\":%zu,\"particleSystems\":%zu,"
		"\"locomotors\":%zu,\"sciences\":%zu,\"upgrades\":%zu,"
		"\"focusedCommandButtons\":%zu,\"focusedCommandSets\":%zu,"
		"\"commandSetButtons\":%zu,\"controlBarImages\":%zu,"
		"\"mappedImageFiles\":%zu,\"mappedImages\":%zu,\"crates\":%zu,"
		"\"challengeGenerals\":%zu,"
		"\"specialPowers\":%zu,\"playerTemplates\":%zu,\"playerSides\":%zu,"
		"\"multiplayerColors\":%zu,\"terrains\":%zu,\"roads\":%zu,"
		"\"bridges\":%zu,\"waterSets\":%zu,\"videos\":%zu},"
		"\"maps\":{\"mapCacheEntries\":%zu,\"multiplayer\":%zu,"
		"\"official\":%zu},"
		"\"strings\":{\"generalsCsf\":%s,\"language\":\"%s\","
		"\"csfPath\":\"%s\",\"selectedCsf\":%s,\"controlBarLabels\":%zu}}",
		startup_data_probes_ready() ? "true" : "false",
		startup_assets_ready() ? "true" : "false",
		g_archive_probe.indexed_file_count,
		g_archive_probe.sample_bytes,
		startup_armor_ready() ? "true" : "false",
		startup_damage_fx_ready() ? "true" : "false",
		startup_fx_list_ready() ? "true" : "false",
		startup_object_creation_list_ready() ? "true" : "false",
		startup_weapon_ready() ? "true" : "false",
		startup_ai_data_ready() ? "true" : "false",
		startup_locomotor_ready() ? "true" : "false",
		startup_science_ready() ? "true" : "false",
		startup_upgrade_ready() ? "true" : "false",
		startup_command_button_ready() ? "true" : "false",
		startup_command_set_ready() ? "true" : "false",
		startup_control_bar_scheme_ready() ? "true" : "false",
		startup_crate_ready() ? "true" : "false",
		g_archive_probe.draw_group_info_attempted &&
			g_archive_probe.draw_group_info_ok ? "true" : "false",
		g_archive_probe.mapped_image_attempted &&
			g_archive_probe.mapped_image_ok ? "true" : "false",
		g_archive_probe.challenge_mode_attempted &&
			g_archive_probe.challenge_mode_ok ? "true" : "false",
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
		g_archive_probe.armor_parsed_fields,
		g_archive_probe.damage_fx_parsed_fields,
		g_archive_probe.fx_list_parsed_fields,
		g_archive_probe.object_creation_list_parsed_fields,
		g_archive_probe.weapon_parsed_fields,
		g_archive_probe.ai_data_parsed_fields,
		g_archive_probe.locomotor_parsed_fields,
		g_archive_probe.science_parsed_fields,
		g_archive_probe.upgrade_parsed_fields,
		g_archive_probe.command_button_parsed_fields,
		g_archive_probe.command_set_parsed_fields,
		g_archive_probe.control_bar_scheme_parsed_fields,
		g_archive_probe.crate_parsed_fields,
		g_archive_probe.draw_group_info_parsed_fields,
		g_archive_probe.mapped_image_parsed_fields,
		g_archive_probe.challenge_mode_parsed_fields,
		g_archive_probe.special_power_parsed_fields,
		g_archive_probe.player_template_parsed_fields,
		g_archive_probe.multiplayer_parsed_fields,
		g_archive_probe.terrain_parsed_fields,
		g_archive_probe.terrain_roads_parsed_fields,
		g_archive_probe.game_data_parsed_fields,
		g_archive_probe.water_parsed_fields,
		g_archive_probe.weather_parsed_fields,
		g_archive_probe.video_parsed_fields,
		g_archive_probe.fx_list_count,
		g_archive_probe.object_creation_list_count,
		g_archive_probe.object_creation_list_nugget_count,
		g_archive_probe.weapon_particle_template_count,
		g_archive_probe.locomotor_template_count,
		g_archive_probe.science_count,
		g_archive_probe.upgrade_count,
		g_archive_probe.command_button_count,
		g_archive_probe.command_set_count,
		g_archive_probe.command_set_command_button_count,
		g_archive_probe.control_bar_scheme_mapped_image_count,
		g_archive_probe.mapped_image_file_count,
		g_archive_probe.mapped_image_count,
		g_archive_probe.crate_template_count,
		g_archive_probe.challenge_mode_persona_count,
		g_archive_probe.special_power_count,
		g_archive_probe.player_template_count,
		g_archive_probe.player_template_side_count,
		g_archive_probe.multiplayer_color_count,
		g_archive_probe.terrain_count,
		g_archive_probe.terrain_roads_road_count,
		g_archive_probe.terrain_roads_bridge_count,
		g_archive_probe.water_set_count,
		g_archive_probe.video_count,
		g_archive_probe.map_cache_maps,
		g_archive_probe.map_cache_multiplayer_maps,
		g_archive_probe.map_cache_official_maps,
		g_archive_probe.has_generals_csf ? "true" : "false",
		game_text_language_json.c_str(),
		game_text_csf_path_json.c_str(),
		g_archive_probe.game_text_selected_csf_exists ? "true" : "false",
		g_archive_probe.game_text_control_bar_label_count);

	return buffer;
}

bool original_engine_startup_files_ready()
{
	return g_archive_probe.loaded &&
		g_archive_probe.has_default_game_data_ini &&
		g_archive_probe.has_game_data_ini &&
		g_archive_probe.has_default_water_ini &&
		g_archive_probe.has_water_ini &&
		g_archive_probe.has_default_weather_ini &&
		g_archive_probe.has_weather_ini &&
		g_archive_probe.has_generals_csf &&
		g_archive_probe.has_default_science_ini &&
		g_archive_probe.has_science_ini &&
		g_archive_probe.has_default_multiplayer_ini &&
		g_archive_probe.has_multiplayer_ini &&
		g_archive_probe.has_default_terrain_ini &&
		g_archive_probe.has_terrain_ini &&
		g_archive_probe.has_default_roads_ini &&
		g_archive_probe.has_roads_ini &&
		g_archive_probe.has_rank_ini &&
		g_archive_probe.has_default_player_template_ini &&
		g_archive_probe.has_player_template_ini &&
		g_archive_probe.has_default_fx_list_ini &&
		g_archive_probe.has_fx_list_ini &&
		g_archive_probe.has_weapon_ini &&
		g_archive_probe.has_default_object_creation_list_ini &&
		g_archive_probe.has_object_creation_list_ini &&
		g_archive_probe.has_locomotor_ini &&
		g_archive_probe.has_default_special_power_ini &&
		g_archive_probe.has_special_power_ini &&
		g_archive_probe.has_damage_fx_ini &&
		g_archive_probe.has_armor_ini &&
		g_archive_probe.has_default_object_ini &&
		g_archive_probe.object_ini_file_count > 0 &&
		g_archive_probe.has_default_upgrade_ini &&
		g_archive_probe.has_upgrade_ini &&
		g_archive_probe.has_default_ai_data_ini &&
		g_archive_probe.has_default_crate_ini &&
		g_archive_probe.has_crate_ini &&
		g_archive_probe.has_english_command_map_ini &&
		g_archive_probe.has_command_map_ini &&
		g_archive_probe.has_map_cache_ini &&
		g_archive_probe.has_default_video_ini &&
		g_archive_probe.has_video_ini;
}

bool base_ini_startup_files_ready()
{
	return g_archive_probe.loaded &&
		g_archive_probe.has_default_game_data_ini &&
		g_archive_probe.has_default_water_ini &&
		g_archive_probe.has_default_weather_ini &&
		g_archive_probe.has_default_science_ini &&
		g_archive_probe.has_default_multiplayer_ini &&
		g_archive_probe.has_default_terrain_ini &&
		g_archive_probe.has_default_roads_ini &&
		g_archive_probe.has_rank_ini &&
		g_archive_probe.has_default_player_template_ini &&
		g_archive_probe.has_default_fx_list_ini &&
		g_archive_probe.has_default_object_creation_list_ini &&
		g_archive_probe.has_default_special_power_ini &&
		g_archive_probe.has_default_object_ini &&
		g_archive_probe.has_default_upgrade_ini &&
		g_archive_probe.has_default_ai_data_ini &&
		g_archive_probe.has_default_crate_ini &&
		g_archive_probe.has_command_map_ini &&
		g_archive_probe.has_default_video_ini;
}

void append_missing_json_path(std::string &json, bool &first, bool present, const char *path)
{
	if (present) {
		return;
	}
	if (!first) {
		json += ",";
	}
	json += "\"";
	json += json_escape(path);
	json += "\"";
	first = false;
}

std::string build_missing_base_ini_startup_files_json()
{
	if (!g_archive_probe.loaded) {
		return "[]";
	}

	std::string json = "[";
	bool first = true;
	append_missing_json_path(json, first, g_archive_probe.has_default_game_data_ini,
		"Data\\INI\\Default\\GameData.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_water_ini,
		"Data\\INI\\Default\\Water.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_weather_ini,
		"Data\\INI\\Default\\Weather.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_science_ini,
		"Data\\INI\\Default\\Science.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_multiplayer_ini,
		"Data\\INI\\Default\\Multiplayer.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_terrain_ini,
		"Data\\INI\\Default\\Terrain.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_roads_ini,
		"Data\\INI\\Default\\Roads.ini");
	append_missing_json_path(json, first, g_archive_probe.has_rank_ini, "Data\\INI\\Rank.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_player_template_ini,
		"Data\\INI\\Default\\PlayerTemplate.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_fx_list_ini,
		"Data\\INI\\Default\\FXList.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_object_creation_list_ini,
		"Data\\INI\\Default\\ObjectCreationList.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_special_power_ini,
		"Data\\INI\\Default\\SpecialPower.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_object_ini,
		"Data\\INI\\Default\\Object.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_upgrade_ini,
		"Data\\INI\\Default\\Upgrade.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_ai_data_ini,
		"Data\\INI\\Default\\AIData.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_crate_ini,
		"Data\\INI\\Default\\Crate.ini");
	append_missing_json_path(json, first, g_archive_probe.has_command_map_ini,
		"Data\\INI\\CommandMap.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_video_ini,
		"Data\\INI\\Default\\Video.ini");

	json += "]";
	return json;
}

const char *base_ini_startup_message()
{
	if (!g_archive_probe.loaded) {
		return "Archive probe has not loaded the original startup file inventory.";
	}
	if (!base_ini_startup_files_ready()) {
		return "Mount or map base Generals INI.big alongside the Zero Hour runtime archives; original GameEngine.cpp still references these default/startup files.";
	}
	return "Original GameEngine.cpp base INI startup files are visible to the archive filesystem.";
}

std::string build_base_ini_startup_files_json()
{
	char buffer[3200];
	const std::string missing_json = build_missing_base_ini_startup_files_json();
	const std::string message_json = json_escape(base_ini_startup_message());

	std::snprintf(buffer, sizeof(buffer),
		"{\"ready\":%s,\"archive\":\"INI.big\","
		"\"source\":\"Base Generals Data1.cab\",\"missing\":%s,"
		"\"message\":\"%s\"}",
		base_ini_startup_files_ready() ? "true" : "false",
		missing_json.c_str(),
		message_json.c_str());

	return buffer;
}

std::string build_missing_original_engine_startup_files_json()
{
	if (!g_archive_probe.loaded) {
		return "[]";
	}

	std::string json = "[";
	bool first = true;

	append_missing_json_path(json, first, g_archive_probe.has_default_game_data_ini, "Data\\INI\\Default\\GameData.ini");
	append_missing_json_path(json, first, g_archive_probe.has_game_data_ini, "Data\\INI\\GameData.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_water_ini, "Data\\INI\\Default\\Water.ini");
	append_missing_json_path(json, first, g_archive_probe.has_water_ini, "Data\\INI\\Water.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_weather_ini, "Data\\INI\\Default\\Weather.ini");
	append_missing_json_path(json, first, g_archive_probe.has_weather_ini, "Data\\INI\\Weather.ini");
	append_missing_json_path(json, first, g_archive_probe.has_generals_csf, "Data\\English\\Generals.csf");
	append_missing_json_path(json, first, g_archive_probe.has_default_science_ini, "Data\\INI\\Default\\Science.ini");
	append_missing_json_path(json, first, g_archive_probe.has_science_ini, "Data\\INI\\Science.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_multiplayer_ini, "Data\\INI\\Default\\Multiplayer.ini");
	append_missing_json_path(json, first, g_archive_probe.has_multiplayer_ini, "Data\\INI\\multiplayer.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_terrain_ini, "Data\\INI\\Default\\Terrain.ini");
	append_missing_json_path(json, first, g_archive_probe.has_terrain_ini, "Data\\INI\\Terrain.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_roads_ini, "Data\\INI\\Default\\Roads.ini");
	append_missing_json_path(json, first, g_archive_probe.has_roads_ini, "Data\\INI\\Roads.ini");
	append_missing_json_path(json, first, g_archive_probe.has_rank_ini, "Data\\INI\\Rank.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_player_template_ini, "Data\\INI\\Default\\PlayerTemplate.ini");
	append_missing_json_path(json, first, g_archive_probe.has_player_template_ini, "Data\\INI\\PlayerTemplate.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_fx_list_ini, "Data\\INI\\Default\\FXList.ini");
	append_missing_json_path(json, first, g_archive_probe.has_fx_list_ini, "Data\\INI\\FXList.ini");
	append_missing_json_path(json, first, g_archive_probe.has_weapon_ini, "Data\\INI\\Weapon.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_object_creation_list_ini, "Data\\INI\\Default\\ObjectCreationList.ini");
	append_missing_json_path(json, first, g_archive_probe.has_object_creation_list_ini, "Data\\INI\\ObjectCreationList.ini");
	append_missing_json_path(json, first, g_archive_probe.has_locomotor_ini, "Data\\INI\\Locomotor.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_special_power_ini, "Data\\INI\\Default\\SpecialPower.ini");
	append_missing_json_path(json, first, g_archive_probe.has_special_power_ini, "Data\\INI\\SpecialPower.ini");
	append_missing_json_path(json, first, g_archive_probe.has_damage_fx_ini, "Data\\INI\\DamageFX.ini");
	append_missing_json_path(json, first, g_archive_probe.has_armor_ini, "Data\\INI\\Armor.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_object_ini, "Data\\INI\\Default\\Object.ini");
	append_missing_json_path(json, first, g_archive_probe.object_ini_file_count > 0, "Data\\INI\\Object\\*.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_upgrade_ini, "Data\\INI\\Default\\Upgrade.ini");
	append_missing_json_path(json, first, g_archive_probe.has_upgrade_ini, "Data\\INI\\Upgrade.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_ai_data_ini, "Data\\INI\\Default\\AIData.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_crate_ini, "Data\\INI\\Default\\Crate.ini");
	append_missing_json_path(json, first, g_archive_probe.has_crate_ini, "Data\\INI\\Crate.ini");
	append_missing_json_path(json, first, g_archive_probe.has_english_command_map_ini, "Data\\English\\CommandMap.ini");
	append_missing_json_path(json, first, g_archive_probe.has_command_map_ini, "Data\\INI\\CommandMap.ini");
	append_missing_json_path(json, first, g_archive_probe.has_map_cache_ini, "Maps\\MapCache.ini");
	append_missing_json_path(json, first, g_archive_probe.has_default_video_ini, "Data\\INI\\Default\\Video.ini");
	append_missing_json_path(json, first, g_archive_probe.has_video_ini, "Data\\INI\\Video.ini");

	json += "]";
	return json;
}

const char *original_engine_startup_status()
{
	if (!g_archive_mount.registered) {
		return "missing_runtime_archives";
	}
	if (!g_archive_mount.boot_probe_attempted) {
		return "pending_boot_probe";
	}
	if (!startup_assets_ready()) {
		return startup_asset_status();
	}
	if (!original_engine_startup_files_ready()) {
		return "missing_startup_files";
	}
	return "browser_device_layer_pending";
}

const char *original_engine_startup_message()
{
	if (!g_archive_mount.registered) {
		return "Register the Zero Hour runtime BIG archive set before attempting original GameEngine::init().";
	}
	if (!g_archive_mount.boot_probe_attempted) {
		return "Runtime BIG archive set is registered; boot must consume it before original GameEngine::init().";
	}
	if (!startup_assets_ready()) {
		return startup_asset_message();
	}
	if (!original_engine_startup_files_ready()) {
		return "Original GameEngine::init() names startup INI/data paths that are absent from the current runtime archive set.";
	}
	return "Original startup data is present; real browser GameEngine device factories must be implemented before init can run.";
}

std::string build_original_engine_startup_json()
{
	char buffer[22000];
	const std::string status_json = json_escape(original_engine_startup_status());
	const std::string message_json = json_escape(original_engine_startup_message());
	const std::string missing_files_json =
		build_missing_original_engine_startup_files_json();
	const std::string base_ini_startup_json = build_base_ini_startup_files_json();

	std::snprintf(buffer, sizeof(buffer),
		"{\"ok\":false,\"source\":\"GameEngine/Common/GameEngine.cpp::init\","
		"\"initAttempted\":false,\"status\":\"%s\",\"message\":\"%s\","
		"\"startupAssetsReady\":%s,\"dataPreflightReady\":%s,"
		"\"startupFiles\":{\"ready\":%s,\"missing\":%s,"
		"\"baseIniArchive\":%s,"
		"\"defaultGameDataIni\":%s,\"gameDataIni\":%s,"
		"\"defaultWaterIni\":%s,\"waterIni\":%s,"
		"\"defaultWeatherIni\":%s,\"weatherIni\":%s,"
		"\"generalsCsf\":%s,\"defaultScienceIni\":%s,\"scienceIni\":%s,"
		"\"defaultMultiplayerIni\":%s,\"multiplayerIni\":%s,"
		"\"defaultTerrainIni\":%s,\"terrainIni\":%s,"
		"\"defaultRoadsIni\":%s,\"roadsIni\":%s,"
		"\"rankIni\":%s,\"defaultPlayerTemplateIni\":%s,"
		"\"playerTemplateIni\":%s,\"defaultFXListIni\":%s,\"fxListIni\":%s,"
		"\"weaponIni\":%s,\"defaultObjectCreationListIni\":%s,"
		"\"objectCreationListIni\":%s,\"locomotorIni\":%s,"
		"\"defaultSpecialPowerIni\":%s,\"specialPowerIni\":%s,"
		"\"damageFXIni\":%s,\"armorIni\":%s,\"defaultObjectIni\":%s,"
		"\"objectIniFiles\":%zu,\"defaultUpgradeIni\":%s,\"upgradeIni\":%s,"
		"\"defaultAIDataIni\":%s,\"defaultCrateIni\":%s,\"crateIni\":%s,"
		"\"englishCommandMapIni\":%s,\"commandMapIni\":%s,"
		"\"mapCacheIni\":%s,\"defaultVideoIni\":%s,\"videoIni\":%s},"
		"\"originalSetup\":{\"probeOnly\":true,\"runtimeOwned\":false,"
		"\"globalData\":%s,\"commandLine\":%s,"
		"\"cdManager\":%s},"
		"\"browserDeviceLayer\":{\"ready\":false,\"createGameEngine\":false,"
		"\"browserGameEngine\":false,\"cdManager\":%s,"
		"\"localFileSystem\":%s,"
		"\"archiveFileSystem\":%s,\"gameLogic\":false,"
		"\"gameClient\":false,\"moduleFactory\":false,"
		"\"thingFactory\":false,\"functionLexicon\":false,\"radar\":false,"
		"\"webBrowser\":false,\"particleSystemManager\":false,"
		"\"audioManager\":false,\"display\":false,\"input\":false}}",
		status_json.c_str(),
		message_json.c_str(),
		startup_assets_ready() ? "true" : "false",
		startup_data_probes_ready() ? "true" : "false",
		original_engine_startup_files_ready() ? "true" : "false",
		missing_files_json.c_str(),
		base_ini_startup_json.c_str(),
		g_archive_probe.has_default_game_data_ini ? "true" : "false",
		g_archive_probe.has_game_data_ini ? "true" : "false",
		g_archive_probe.has_default_water_ini ? "true" : "false",
		g_archive_probe.has_water_ini ? "true" : "false",
		g_archive_probe.has_default_weather_ini ? "true" : "false",
		g_archive_probe.has_weather_ini ? "true" : "false",
		g_archive_probe.has_generals_csf ? "true" : "false",
		g_archive_probe.has_default_science_ini ? "true" : "false",
		g_archive_probe.has_science_ini ? "true" : "false",
		g_archive_probe.has_default_multiplayer_ini ? "true" : "false",
		g_archive_probe.has_multiplayer_ini ? "true" : "false",
		g_archive_probe.has_default_terrain_ini ? "true" : "false",
		g_archive_probe.has_terrain_ini ? "true" : "false",
		g_archive_probe.has_default_roads_ini ? "true" : "false",
		g_archive_probe.has_roads_ini ? "true" : "false",
		g_archive_probe.has_rank_ini ? "true" : "false",
		g_archive_probe.has_default_player_template_ini ? "true" : "false",
		g_archive_probe.has_player_template_ini ? "true" : "false",
		g_archive_probe.has_default_fx_list_ini ? "true" : "false",
		g_archive_probe.has_fx_list_ini ? "true" : "false",
		g_archive_probe.has_weapon_ini ? "true" : "false",
		g_archive_probe.has_default_object_creation_list_ini ? "true" : "false",
		g_archive_probe.has_object_creation_list_ini ? "true" : "false",
		g_archive_probe.has_locomotor_ini ? "true" : "false",
		g_archive_probe.has_default_special_power_ini ? "true" : "false",
		g_archive_probe.has_special_power_ini ? "true" : "false",
		g_archive_probe.has_damage_fx_ini ? "true" : "false",
		g_archive_probe.has_armor_ini ? "true" : "false",
		g_archive_probe.has_default_object_ini ? "true" : "false",
		g_archive_probe.object_ini_file_count,
		g_archive_probe.has_default_upgrade_ini ? "true" : "false",
		g_archive_probe.has_upgrade_ini ? "true" : "false",
		g_archive_probe.has_default_ai_data_ini ? "true" : "false",
		g_archive_probe.has_default_crate_ini ? "true" : "false",
		g_archive_probe.has_crate_ini ? "true" : "false",
		g_archive_probe.has_english_command_map_ini ? "true" : "false",
		g_archive_probe.has_command_map_ini ? "true" : "false",
		g_archive_probe.has_map_cache_ini ? "true" : "false",
		g_archive_probe.has_default_video_ini ? "true" : "false",
		g_archive_probe.has_video_ini ? "true" : "false",
		g_global_data_probe.ok ? "true" : "false",
		g_command_line_probe.ok ? "true" : "false",
		g_cd_manager_probe.ok ? "true" : "false",
		g_cd_manager_probe.ok ? "true" : "false",
		g_file_system_probe.local_ok ? "true" : "false",
		g_file_system_probe.archive_ok ? "true" : "false");

	return buffer;
}

std::string build_damage_fx_probe_json()
{
	char buffer[3200];
	const std::string source_json = json_escape(g_archive_probe.damage_fx_source);

	std::snprintf(buffer, sizeof(buffer),
		"{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"source\":\"%s\",\"loadedArchives\":%s,\"fileExists\":%s,"
		"\"nameKeyGeneratorLoaded\":%s,\"fxListStoreLoaded\":%s,"
		"\"damageFXStoreLoaded\":%s,\"originalIniLoad\":%s,"
		"\"parsedFields\":%zu,"
		"\"found\":{\"default\":%s,\"tank\":%s,\"smallTank\":%s,"
		"\"structure\":%s,\"infantry\":%s},"
		"\"throttle\":{\"defaultExplosion\":%u,"
		"\"tankSmallArms\":%u,\"smallTankComanche\":%u,"
		"\"structureFlame\":%u,\"infantrySniper\":%u}}",
		g_archive_probe.damage_fx_attempted ? "true" : "false",
		g_archive_probe.damage_fx_ok ? "true" : "false",
		g_archive_probe.damage_fx_bytes,
		source_json.c_str(),
		g_archive_probe.damage_fx_loaded_archives ? "true" : "false",
		g_archive_probe.damage_fx_file_exists ? "true" : "false",
		g_archive_probe.damage_fx_name_key_generator_loaded ? "true" : "false",
		g_archive_probe.damage_fx_fx_list_store_loaded ? "true" : "false",
		g_archive_probe.damage_fx_store_loaded ? "true" : "false",
		g_archive_probe.damage_fx_original_ini_load ? "true" : "false",
		g_archive_probe.damage_fx_parsed_fields,
		g_archive_probe.damage_fx_default_found ? "true" : "false",
		g_archive_probe.damage_fx_tank_found ? "true" : "false",
		g_archive_probe.damage_fx_small_tank_found ? "true" : "false",
		g_archive_probe.damage_fx_structure_found ? "true" : "false",
		g_archive_probe.damage_fx_infantry_found ? "true" : "false",
		g_archive_probe.damage_fx_default_explosion_throttle,
		g_archive_probe.damage_fx_tank_small_arms_throttle,
		g_archive_probe.damage_fx_small_tank_comanche_throttle,
		g_archive_probe.damage_fx_structure_flame_throttle,
		g_archive_probe.damage_fx_infantry_sniper_throttle);

	return buffer;
}

std::string build_fx_list_probe_json()
{
	char buffer[3200];
	const std::string source_json = json_escape(g_archive_probe.fx_list_source);

	std::snprintf(buffer, sizeof(buffer),
		"{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"source\":\"%s\",\"loadedArchives\":%s,\"fileExists\":%s,"
		"\"nameKeyGeneratorLoaded\":%s,\"fxListStoreLoaded\":%s,"
		"\"originalIniLoad\":%s,\"parsedFields\":%zu,\"lists\":%zu,"
		"\"samples\":{\"toxinShell\":{\"found\":%s,\"nuggets\":%zu},"
		"\"carCrusher\":{\"found\":%s,\"nuggets\":%zu},"
		"\"damageTankStruck\":{\"found\":%s,\"nuggets\":%zu},"
		"\"moabBlast\":{\"found\":%s,\"nuggets\":%zu},"
		"\"bunkerBuster\":{\"found\":%s,\"nuggets\":%zu}}}",
		g_archive_probe.fx_list_attempted ? "true" : "false",
		g_archive_probe.fx_list_ok ? "true" : "false",
		g_archive_probe.fx_list_bytes,
		source_json.c_str(),
		g_archive_probe.fx_list_loaded_archives ? "true" : "false",
		g_archive_probe.fx_list_file_exists ? "true" : "false",
		g_archive_probe.fx_list_name_key_generator_loaded ? "true" : "false",
		g_archive_probe.fx_list_store_loaded ? "true" : "false",
		g_archive_probe.fx_list_original_ini_load ? "true" : "false",
		g_archive_probe.fx_list_parsed_fields,
		g_archive_probe.fx_list_count,
		g_archive_probe.fx_list_toxin_shell_found ? "true" : "false",
		g_archive_probe.fx_list_toxin_shell_nuggets,
		g_archive_probe.fx_list_car_crusher_found ? "true" : "false",
		g_archive_probe.fx_list_car_crusher_nuggets,
		g_archive_probe.fx_list_damage_tank_struck_found ? "true" : "false",
		g_archive_probe.fx_list_damage_tank_struck_nuggets,
		g_archive_probe.fx_list_moab_blast_found ? "true" : "false",
		g_archive_probe.fx_list_moab_blast_nuggets,
		g_archive_probe.fx_list_bunker_buster_found ? "true" : "false",
		g_archive_probe.fx_list_bunker_buster_nuggets);

	return buffer;
}

std::string build_object_creation_list_probe_json()
{
	char buffer[4600];
	const std::string source_json =
		json_escape(g_archive_probe.object_creation_list_source);

	std::snprintf(buffer, sizeof(buffer),
		"{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"fxListBytes\":%zu,\"weaponBytes\":%zu,\"particleBytes\":%zu,"
		"\"source\":\"%s\",\"loadedArchives\":%s,"
		"\"defaultFileExists\":%s,\"fileExists\":%s,"
		"\"fxListFileExists\":%s,\"weaponFileExists\":%s,"
		"\"particleFileExists\":%s,\"nameKeyGeneratorLoaded\":%s,"
		"\"fxListStoreLoaded\":%s,\"particleSystemManagerLoaded\":%s,"
		"\"weaponStoreLoaded\":%s,\"objectCreationListStoreLoaded\":%s,"
		"\"fxListOriginalIniLoad\":%s,"
		"\"particleOriginalIniLoad\":%s,\"weaponOriginalIniLoad\":%s,"
		"\"defaultOriginalIniLoad\":%s,\"originalIniLoad\":%s,"
		"\"parsedFields\":%zu,\"lists\":%zu,\"nuggets\":%zu,"
		"\"samples\":{\"fireWallSegment\":{\"found\":%s,\"nuggets\":%zu},"
		"\"technicalCrush\":{\"found\":%s,\"nuggets\":%zu},"
		"\"daisyCutter\":{\"found\":%s,\"nuggets\":%zu},"
		"\"scudStorm\":{\"found\":%s,\"nuggets\":%zu},"
		"\"sneakAttackTunnel\":{\"found\":%s,\"nuggets\":%zu}}}",
		g_archive_probe.object_creation_list_attempted ? "true" : "false",
		g_archive_probe.object_creation_list_ok ? "true" : "false",
		g_archive_probe.object_creation_list_bytes,
		g_archive_probe.object_creation_list_fx_list_bytes,
		g_archive_probe.object_creation_list_weapon_bytes,
		g_archive_probe.object_creation_list_particle_bytes,
		source_json.c_str(),
		g_archive_probe.object_creation_list_loaded_archives ? "true" : "false",
		g_archive_probe.object_creation_list_default_file_exists ? "true" : "false",
		g_archive_probe.object_creation_list_file_exists ? "true" : "false",
		g_archive_probe.object_creation_list_fx_list_file_exists ? "true" : "false",
		g_archive_probe.object_creation_list_weapon_file_exists ? "true" : "false",
		g_archive_probe.object_creation_list_particle_file_exists ? "true" : "false",
		g_archive_probe.object_creation_list_name_key_generator_loaded ?
			"true" : "false",
		g_archive_probe.object_creation_list_fx_list_store_loaded ?
			"true" : "false",
		g_archive_probe.object_creation_list_particle_system_manager_loaded ?
			"true" : "false",
		g_archive_probe.object_creation_list_weapon_store_loaded ?
			"true" : "false",
		g_archive_probe.object_creation_list_store_loaded ? "true" : "false",
		g_archive_probe.object_creation_list_fx_list_original_ini_load ?
			"true" : "false",
		g_archive_probe.object_creation_list_particle_original_ini_load ?
			"true" : "false",
		g_archive_probe.object_creation_list_weapon_original_ini_load ?
			"true" : "false",
		g_archive_probe.object_creation_list_default_original_ini_load ?
			"true" : "false",
		g_archive_probe.object_creation_list_original_ini_load ?
			"true" : "false",
		g_archive_probe.object_creation_list_parsed_fields,
		g_archive_probe.object_creation_list_count,
		g_archive_probe.object_creation_list_nugget_count,
		g_archive_probe.object_creation_list_fire_wall_segment_found ?
			"true" : "false",
		g_archive_probe.object_creation_list_fire_wall_segment_nuggets,
		g_archive_probe.object_creation_list_technical_crush_found ?
			"true" : "false",
		g_archive_probe.object_creation_list_technical_crush_nuggets,
		g_archive_probe.object_creation_list_daisy_cutter_found ?
			"true" : "false",
		g_archive_probe.object_creation_list_daisy_cutter_nuggets,
		g_archive_probe.object_creation_list_scud_storm_found ?
			"true" : "false",
		g_archive_probe.object_creation_list_scud_storm_nuggets,
		g_archive_probe.object_creation_list_sneak_attack_tunnel_found ?
			"true" : "false",
		g_archive_probe.object_creation_list_sneak_attack_tunnel_nuggets);

	return buffer;
}

std::string build_weapon_probe_json()
{
	char buffer[6200];
	const std::string source_json = json_escape(g_archive_probe.weapon_source);
	const std::string ranger_fire_sound_json =
		json_escape(g_archive_probe.weapon_ranger_fire_sound);
	const std::string crusader_fire_sound_json =
		json_escape(g_archive_probe.weapon_crusader_fire_sound);
	const std::string tomahawk_fire_sound_json =
		json_escape(g_archive_probe.weapon_tomahawk_fire_sound);

	std::snprintf(buffer, sizeof(buffer),
		"{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"particleBytes\":%zu,\"particleTemplates\":%zu,"
		"\"source\":\"%s\",\"loadedArchives\":%s,\"fileExists\":%s,"
		"\"particleFileExists\":%s,\"nameKeyGeneratorLoaded\":%s,"
		"\"fxListStoreLoaded\":%s,\"particleSystemManagerLoaded\":%s,"
		"\"weaponStoreLoaded\":%s,\"particleOriginalIniLoad\":%s,"
		"\"originalIniLoad\":%s,\"parsedFields\":%zu,"
		"\"particleTemplatesFound\":{\"tomahawkExhaust\":%s,"
		"\"heroicTomahawkExhaust\":%s},"
		"\"ranger\":{\"found\":%s,\"primaryDamage\":%.3f,"
		"\"attackRange\":%.3f,\"delayFrames\":%d,\"clipSize\":%d,"
		"\"clipReloadFrames\":%d,\"damageType\":%d,\"deathType\":%d,"
		"\"fireSound\":\"%s\"},"
		"\"crusader\":{\"found\":%s,\"primaryDamage\":%.3f,"
		"\"primaryDamageRadius\":%.3f,\"attackRange\":%.3f,"
		"\"delayFrames\":%d,\"clipSize\":%d,\"damageType\":%d,"
		"\"deathType\":%d,\"fireSound\":\"%s\"},"
		"\"tomahawk\":{\"found\":%s,\"primaryDamage\":%.3f,"
		"\"primaryDamageRadius\":%.3f,\"secondaryDamage\":%.3f,"
		"\"secondaryDamageRadius\":%.3f,\"attackRange\":%.3f,"
		"\"minimumAttackRange\":%.3f,\"preAttackDelayFrames\":%d,"
		"\"delayFrames\":%d,\"clipSize\":%d,\"clipReloadFrames\":%d,"
		"\"damageType\":%d,\"deathType\":%d,\"fireSound\":\"%s\","
		"\"projectileExhaustLoaded\":%s,"
		"\"heroicProjectileExhaustLoaded\":%s}}",
		g_archive_probe.weapon_attempted ? "true" : "false",
		g_archive_probe.weapon_ok ? "true" : "false",
		g_archive_probe.weapon_bytes,
		g_archive_probe.weapon_particle_bytes,
		g_archive_probe.weapon_particle_template_count,
		source_json.c_str(),
		g_archive_probe.weapon_loaded_archives ? "true" : "false",
		g_archive_probe.weapon_file_exists ? "true" : "false",
		g_archive_probe.weapon_particle_file_exists ? "true" : "false",
		g_archive_probe.weapon_name_key_generator_loaded ? "true" : "false",
		g_archive_probe.weapon_fx_list_store_loaded ? "true" : "false",
		g_archive_probe.weapon_particle_system_manager_loaded ? "true" : "false",
		g_archive_probe.weapon_store_loaded ? "true" : "false",
		g_archive_probe.weapon_particle_original_ini_load ? "true" : "false",
		g_archive_probe.weapon_original_ini_load ? "true" : "false",
		g_archive_probe.weapon_parsed_fields,
		g_archive_probe.weapon_tomahawk_exhaust_template_found ? "true" : "false",
		g_archive_probe.weapon_heroic_tomahawk_exhaust_template_found ? "true" : "false",
		g_archive_probe.weapon_ranger_found ? "true" : "false",
		g_archive_probe.weapon_ranger_primary_damage,
		g_archive_probe.weapon_ranger_attack_range,
		g_archive_probe.weapon_ranger_delay_frames,
		g_archive_probe.weapon_ranger_clip_size,
		g_archive_probe.weapon_ranger_clip_reload_frames,
		g_archive_probe.weapon_ranger_damage_type,
		g_archive_probe.weapon_ranger_death_type,
		ranger_fire_sound_json.c_str(),
		g_archive_probe.weapon_crusader_found ? "true" : "false",
		g_archive_probe.weapon_crusader_primary_damage,
		g_archive_probe.weapon_crusader_primary_damage_radius,
		g_archive_probe.weapon_crusader_attack_range,
		g_archive_probe.weapon_crusader_delay_frames,
		g_archive_probe.weapon_crusader_clip_size,
		g_archive_probe.weapon_crusader_damage_type,
		g_archive_probe.weapon_crusader_death_type,
		crusader_fire_sound_json.c_str(),
		g_archive_probe.weapon_tomahawk_found ? "true" : "false",
		g_archive_probe.weapon_tomahawk_primary_damage,
		g_archive_probe.weapon_tomahawk_primary_damage_radius,
		g_archive_probe.weapon_tomahawk_secondary_damage,
		g_archive_probe.weapon_tomahawk_secondary_damage_radius,
		g_archive_probe.weapon_tomahawk_attack_range,
		g_archive_probe.weapon_tomahawk_minimum_attack_range,
		g_archive_probe.weapon_tomahawk_pre_attack_delay_frames,
		g_archive_probe.weapon_tomahawk_delay_frames,
		g_archive_probe.weapon_tomahawk_clip_size,
		g_archive_probe.weapon_tomahawk_clip_reload_frames,
		g_archive_probe.weapon_tomahawk_damage_type,
		g_archive_probe.weapon_tomahawk_death_type,
		tomahawk_fire_sound_json.c_str(),
		g_archive_probe.weapon_tomahawk_projectile_exhaust_loaded ? "true" : "false",
		g_archive_probe.weapon_tomahawk_heroic_projectile_exhaust_loaded ? "true" : "false");

	return buffer;
}

std::string build_ai_data_probe_json()
{
	char buffer[7600];
	const std::string source_json = json_escape(g_archive_probe.ai_data_source);
	const std::string america_base_defense_json =
		json_escape(g_archive_probe.ai_data_america_base_defense_structure);
	const std::string america_skill_set1_first_science_json =
		json_escape(g_archive_probe.ai_data_america_skill_set1_first_science);
	const std::string gla_base_defense_json =
		json_escape(g_archive_probe.ai_data_gla_base_defense_structure);
	const std::string america_first_build_template_json =
		json_escape(g_archive_probe.ai_data_america_first_build_template);

	std::snprintf(buffer, sizeof(buffer),
		"{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,\"scienceBytes\":%zu,"
		"\"source\":\"%s\",\"loadedArchives\":%s,\"defaultFileExists\":%s,"
		"\"overrideFileExists\":%s,\"scienceFileExists\":%s,"
		"\"scienceStoreLoaded\":%s,\"aiLoaded\":%s,"
		"\"scienceOriginalIniLoad\":%s,\"defaultOriginalIniLoad\":%s,"
		"\"overrideOriginalIniLoad\":%s,\"parsedFields\":%zu,"
		"\"timing\":{\"structureSeconds\":%.3f,\"teamSeconds\":%.3f,"
		"\"forceIdleFrames\":%u,\"guardChaseUnitFrames\":%u,"
		"\"guardEnemyScanFrames\":%u,\"guardEnemyReturnScanFrames\":%u},"
		"\"resources\":{\"wealthy\":%d,\"poor\":%d,"
		"\"teamResourcesToStart\":%.3f},"
		"\"rates\":{\"structuresWealthy\":%.3f,\"teamsWealthy\":%.3f,"
		"\"structuresPoor\":%.3f,\"teamsPoor\":%.3f},"
		"\"guard\":{\"innerAI\":%.3f,\"outerAI\":%.3f,"
		"\"innerHuman\":%.3f,\"outerHuman\":%.3f},"
		"\"combat\":{\"attackPriorityDistanceModifier\":%.3f,"
		"\"maxRecruitRadius\":%.3f,"
		"\"skirmishBaseDefenseExtraDistance\":%.3f,"
		"\"wallHeight\":%.3f,\"attackUsesLineOfSight\":%s,"
		"\"attackIgnoreInsignificantBuildings\":%s,"
		"\"enableRepulsors\":%s,\"aiCrushesInfantry\":%s,"
		"\"supplyCenterSafeRadius\":%.3f,\"rebuildDelaySeconds\":%d},"
		"\"groupPathing\":{\"minInfantryForGroup\":%d,"
		"\"minVehiclesForGroup\":%d,\"minDistanceForGroup\":%.3f,"
		"\"distanceRequiresGroup\":%.3f},"
		"\"counts\":{\"sideInfo\":%zu,\"buildLists\":%zu},"
		"\"america\":{\"found\":%s,\"resourceGatherersEasy\":%d,"
		"\"resourceGatherersNormal\":%d,\"resourceGatherersHard\":%d,"
		"\"baseDefenseStructure\":\"%s\",\"skillSet1Count\":%zu,"
		"\"skillSet1FirstScience\":\"%s\"},"
		"\"gla\":{\"found\":%s,\"resourceGatherersEasy\":%d,"
		"\"baseDefenseStructure\":\"%s\"},"
		"\"americaBuildList\":{\"found\":%s,\"structures\":%zu,"
		"\"firstTemplate\":\"%s\",\"firstX\":%.3f,\"firstY\":%.3f,"
		"\"firstAngle\":%.5f,\"firstAutomaticallyBuild\":%s}}",
		g_archive_probe.ai_data_attempted ? "true" : "false",
		g_archive_probe.ai_data_ok ? "true" : "false",
		g_archive_probe.ai_data_bytes,
		g_archive_probe.ai_data_science_bytes,
		source_json.c_str(),
		g_archive_probe.ai_data_loaded_archives ? "true" : "false",
		g_archive_probe.ai_data_default_file_exists ? "true" : "false",
		g_archive_probe.ai_data_override_file_exists ? "true" : "false",
		g_archive_probe.ai_data_science_file_exists ? "true" : "false",
		g_archive_probe.ai_data_science_store_loaded ? "true" : "false",
		g_archive_probe.ai_data_ai_loaded ? "true" : "false",
		g_archive_probe.ai_data_science_original_ini_load ? "true" : "false",
		g_archive_probe.ai_data_default_original_ini_load ? "true" : "false",
		g_archive_probe.ai_data_override_original_ini_load ? "true" : "false",
		g_archive_probe.ai_data_parsed_fields,
		g_archive_probe.ai_data_structure_seconds,
		g_archive_probe.ai_data_team_seconds,
		g_archive_probe.ai_data_force_idle_frames,
		g_archive_probe.ai_data_guard_chase_unit_frames,
		g_archive_probe.ai_data_guard_enemy_scan_frames,
		g_archive_probe.ai_data_guard_enemy_return_scan_frames,
		g_archive_probe.ai_data_resources_wealthy,
		g_archive_probe.ai_data_resources_poor,
		g_archive_probe.ai_data_team_resources_to_start,
		g_archive_probe.ai_data_structures_wealthy_rate,
		g_archive_probe.ai_data_teams_wealthy_rate,
		g_archive_probe.ai_data_structures_poor_rate,
		g_archive_probe.ai_data_teams_poor_rate,
		g_archive_probe.ai_data_guard_inner_modifier_ai,
		g_archive_probe.ai_data_guard_outer_modifier_ai,
		g_archive_probe.ai_data_guard_inner_modifier_human,
		g_archive_probe.ai_data_guard_outer_modifier_human,
		g_archive_probe.ai_data_attack_priority_distance_modifier,
		g_archive_probe.ai_data_max_recruit_radius,
		g_archive_probe.ai_data_skirmish_base_defense_extra_distance,
		g_archive_probe.ai_data_wall_height,
		g_archive_probe.ai_data_attack_uses_line_of_sight ? "true" : "false",
		g_archive_probe.ai_data_attack_ignore_insignificant_buildings ?
			"true" : "false",
		g_archive_probe.ai_data_enable_repulsors ? "true" : "false",
		g_archive_probe.ai_data_ai_crushes_infantry ? "true" : "false",
		g_archive_probe.ai_data_supply_center_safe_radius,
		g_archive_probe.ai_data_rebuild_delay_seconds,
		g_archive_probe.ai_data_min_infantry_for_group,
		g_archive_probe.ai_data_min_vehicles_for_group,
		g_archive_probe.ai_data_min_distance_for_group,
		g_archive_probe.ai_data_distance_requires_group,
		g_archive_probe.ai_data_side_info_count,
		g_archive_probe.ai_data_build_list_count,
		g_archive_probe.ai_data_america_side_found ? "true" : "false",
		g_archive_probe.ai_data_america_resource_gatherers_easy,
		g_archive_probe.ai_data_america_resource_gatherers_normal,
		g_archive_probe.ai_data_america_resource_gatherers_hard,
		america_base_defense_json.c_str(),
		g_archive_probe.ai_data_america_skill_set1_count,
		america_skill_set1_first_science_json.c_str(),
		g_archive_probe.ai_data_gla_side_found ? "true" : "false",
		g_archive_probe.ai_data_gla_resource_gatherers_easy,
		gla_base_defense_json.c_str(),
		g_archive_probe.ai_data_america_build_list_found ? "true" : "false",
		g_archive_probe.ai_data_america_build_list_structure_count,
		america_first_build_template_json.c_str(),
		g_archive_probe.ai_data_america_first_build_x,
		g_archive_probe.ai_data_america_first_build_y,
		g_archive_probe.ai_data_america_first_build_angle,
		g_archive_probe.ai_data_america_first_build_automatically_build ?
			"true" : "false");

	return buffer;
}

std::string build_locomotor_probe_json()
{
	char buffer[5200];
	const std::string source_json = json_escape(g_archive_probe.locomotor_source);

	std::snprintf(buffer, sizeof(buffer),
		"{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"source\":\"%s\",\"loadedArchives\":%s,\"fileExists\":%s,"
		"\"nameKeyGeneratorLoaded\":%s,\"locomotorStoreLoaded\":%s,"
		"\"originalIniLoad\":%s,\"parsedFields\":%zu,\"templates\":%zu,"
		"\"basicHuman\":{\"found\":%s,\"speed\":%.6f,"
		"\"speedDamaged\":%.6f,\"turnRate\":%.6f,"
		"\"acceleration\":%.6f,\"braking\":%.6f,"
		"\"surfaces\":%d,\"appearance\":%d,\"zBehavior\":%d,"
		"\"movePriority\":%d,\"stickToGround\":%s},"
		"\"missileDefender\":{\"found\":%s,\"speed\":%.6f,"
		"\"movePriority\":%d},"
		"\"humvee\":{\"found\":%s,\"speed\":%.6f,"
		"\"speedDamaged\":%.6f,\"turnRate\":%.6f,"
		"\"acceleration\":%.6f,\"braking\":%.6f,"
		"\"minTurnSpeed\":%.6f,\"turnPivotOffset\":%.6f,"
		"\"wheelTurnAngle\":%.6f,\"maxWheelExtension\":%.6f,"
		"\"maxWheelCompression\":%.6f,\"surfaces\":%d,"
		"\"appearance\":%d,\"zBehavior\":%d,\"stickToGround\":%s,"
		"\"hasSuspension\":%s,\"canMoveBackward\":%s},"
		"\"comanche\":{\"found\":%s,\"speed\":%.6f,"
		"\"speedDamaged\":%.6f,\"turnRate\":%.6f,"
		"\"acceleration\":%.6f,\"lift\":%.6f,\"liftDamaged\":%.6f,"
		"\"braking\":%.6f,\"preferredHeight\":%.3f,"
		"\"surfaces\":%d,\"appearance\":%d,\"zBehavior\":%d,"
		"\"airborneTargetingHeight\":%d,"
		"\"allowAirborneMotiveForce\":%s,"
		"\"apply2DFrictionWhenAirborne\":%s,"
		"\"locomotorWorksWhenDead\":%s}}",
		g_archive_probe.locomotor_attempted ? "true" : "false",
		g_archive_probe.locomotor_ok ? "true" : "false",
		g_archive_probe.locomotor_bytes,
		source_json.c_str(),
		g_archive_probe.locomotor_loaded_archives ? "true" : "false",
		g_archive_probe.locomotor_file_exists ? "true" : "false",
		g_archive_probe.locomotor_name_key_generator_loaded ? "true" : "false",
		g_archive_probe.locomotor_store_loaded ? "true" : "false",
		g_archive_probe.locomotor_original_ini_load ? "true" : "false",
		g_archive_probe.locomotor_parsed_fields,
		g_archive_probe.locomotor_template_count,
		g_archive_probe.locomotor_basic_human_found ? "true" : "false",
		g_archive_probe.locomotor_basic_human_speed,
		g_archive_probe.locomotor_basic_human_speed_damaged,
		g_archive_probe.locomotor_basic_human_turn_rate,
		g_archive_probe.locomotor_basic_human_acceleration,
		g_archive_probe.locomotor_basic_human_braking,
		g_archive_probe.locomotor_basic_human_surfaces,
		g_archive_probe.locomotor_basic_human_appearance,
		g_archive_probe.locomotor_basic_human_z_behavior,
		g_archive_probe.locomotor_basic_human_move_priority,
		g_archive_probe.locomotor_basic_human_stick_to_ground ? "true" : "false",
		g_archive_probe.locomotor_missile_defender_found ? "true" : "false",
		g_archive_probe.locomotor_missile_defender_speed,
		g_archive_probe.locomotor_missile_defender_move_priority,
		g_archive_probe.locomotor_humvee_found ? "true" : "false",
		g_archive_probe.locomotor_humvee_speed,
		g_archive_probe.locomotor_humvee_speed_damaged,
		g_archive_probe.locomotor_humvee_turn_rate,
		g_archive_probe.locomotor_humvee_acceleration,
		g_archive_probe.locomotor_humvee_braking,
		g_archive_probe.locomotor_humvee_min_turn_speed,
		g_archive_probe.locomotor_humvee_turn_pivot_offset,
		g_archive_probe.locomotor_humvee_wheel_turn_angle,
		g_archive_probe.locomotor_humvee_max_wheel_extension,
		g_archive_probe.locomotor_humvee_max_wheel_compression,
		g_archive_probe.locomotor_humvee_surfaces,
		g_archive_probe.locomotor_humvee_appearance,
		g_archive_probe.locomotor_humvee_z_behavior,
		g_archive_probe.locomotor_humvee_stick_to_ground ? "true" : "false",
		g_archive_probe.locomotor_humvee_has_suspension ? "true" : "false",
		g_archive_probe.locomotor_humvee_can_move_backward ? "true" : "false",
		g_archive_probe.locomotor_comanche_found ? "true" : "false",
		g_archive_probe.locomotor_comanche_speed,
		g_archive_probe.locomotor_comanche_speed_damaged,
		g_archive_probe.locomotor_comanche_turn_rate,
		g_archive_probe.locomotor_comanche_acceleration,
		g_archive_probe.locomotor_comanche_lift,
		g_archive_probe.locomotor_comanche_lift_damaged,
		g_archive_probe.locomotor_comanche_braking,
		g_archive_probe.locomotor_comanche_preferred_height,
		g_archive_probe.locomotor_comanche_surfaces,
		g_archive_probe.locomotor_comanche_appearance,
		g_archive_probe.locomotor_comanche_z_behavior,
		g_archive_probe.locomotor_comanche_airborne_targeting_height,
		g_archive_probe.locomotor_comanche_allow_airborne_motive_force ?
			"true" : "false",
		g_archive_probe.locomotor_comanche_apply_2d_friction_when_airborne ?
			"true" : "false",
		g_archive_probe.locomotor_comanche_locomotor_works_when_dead ?
			"true" : "false");

	return buffer;
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

std::string build_command_set_probe_json()
{
	char buffer[10000];
	const std::string source_json = json_escape(g_archive_probe.command_set_source);
	const std::string slot1_json = json_escape(g_archive_probe.command_set_ranger_slot1);
	const std::string slot2_json = json_escape(g_archive_probe.command_set_ranger_slot2);
	const std::string slot4_json = json_escape(g_archive_probe.command_set_ranger_slot4);
	const std::string slot11_json = json_escape(g_archive_probe.command_set_ranger_slot11);
	const std::string slot13_json = json_escape(g_archive_probe.command_set_ranger_slot13);
	const std::string slot14_json = json_escape(g_archive_probe.command_set_ranger_slot14);
	const std::string slot1_special_power_json =
		json_escape(g_archive_probe.command_set_ranger_slot1_special_power);
	const std::string slot1_upgrade_json =
		json_escape(g_archive_probe.command_set_ranger_slot1_upgrade);
	const std::string slot4_upgrade_json =
		json_escape(g_archive_probe.command_set_ranger_slot4_upgrade);

	std::snprintf(buffer, sizeof(buffer),
		"{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"commandButtonBytes\":%zu,\"specialPowerBytes\":%zu,"
		"\"upgradeBytes\":%zu,\"source\":\"%s\","
		"\"loadedArchives\":%s,\"fileExists\":%s,"
		"\"commandButtonFileExists\":%s,\"specialPowerFileExists\":%s,"
		"\"upgradeFileExists\":%s,\"nameKeyGeneratorLoaded\":%s,"
		"\"specialPowerOriginalIniLoad\":%s,\"upgradeOriginalIniLoad\":%s,"
		"\"commandButtonOriginalIniLoad\":%s,\"originalIniLoad\":%s,"
		"\"filteredFromShipped\":%s,"
		"\"filteredCommandButtonBytes\":%zu,"
		"\"filteredCommandButtonBlocks\":%zu,"
		"\"filteredCommandSetBytes\":%zu,"
		"\"filteredCommandSetBlocks\":%zu,"
		"\"parsedFields\":%zu,\"commandButtons\":%zu,\"commandSets\":%zu,"
		"\"ranger\":{\"found\":%s,"
		"\"slot1\":{\"name\":\"%s\",\"command\":%d,"
		"\"specialPower\":\"%s\",\"upgrade\":\"%s\"},"
		"\"slot2\":{\"name\":\"%s\",\"command\":%d,\"weaponSlot\":%d},"
		"\"slot4\":{\"name\":\"%s\",\"command\":%d,\"weaponSlot\":%d,"
		"\"upgrade\":\"%s\"},"
		"\"slot11\":{\"name\":\"%s\",\"command\":%d},"
		"\"slot13\":{\"name\":\"%s\",\"command\":%d},"
		"\"slot14\":{\"name\":\"%s\",\"command\":%d}}}",
		g_archive_probe.command_set_attempted ? "true" : "false",
		g_archive_probe.command_set_ok ? "true" : "false",
		g_archive_probe.command_set_bytes,
		g_archive_probe.command_set_command_button_bytes,
		g_archive_probe.command_set_special_power_bytes,
		g_archive_probe.command_set_upgrade_bytes,
		source_json.c_str(),
		g_archive_probe.command_set_loaded_archives ? "true" : "false",
		g_archive_probe.command_set_file_exists ? "true" : "false",
		g_archive_probe.command_set_command_button_file_exists ? "true" : "false",
		g_archive_probe.command_set_special_power_file_exists ? "true" : "false",
		g_archive_probe.command_set_upgrade_file_exists ? "true" : "false",
		g_archive_probe.command_set_name_key_generator_loaded ? "true" : "false",
		g_archive_probe.command_set_special_power_original_ini_load ? "true" : "false",
		g_archive_probe.command_set_upgrade_original_ini_load ? "true" : "false",
		g_archive_probe.command_set_command_button_original_ini_load ? "true" : "false",
		g_archive_probe.command_set_original_ini_load ? "true" : "false",
		g_archive_probe.command_set_filtered_from_shipped ? "true" : "false",
		g_archive_probe.command_set_filtered_command_button_bytes,
		g_archive_probe.command_set_filtered_command_button_blocks,
		g_archive_probe.command_set_filtered_command_set_bytes,
		g_archive_probe.command_set_filtered_command_set_blocks,
		g_archive_probe.command_set_parsed_fields,
		g_archive_probe.command_set_command_button_count,
		g_archive_probe.command_set_count,
		g_archive_probe.command_set_ranger_found ? "true" : "false",
		slot1_json.c_str(),
		g_archive_probe.command_set_ranger_slot1_command,
		slot1_special_power_json.c_str(),
		slot1_upgrade_json.c_str(),
		slot2_json.c_str(),
		g_archive_probe.command_set_ranger_slot2_command,
		g_archive_probe.command_set_ranger_slot2_weapon_slot,
		slot4_json.c_str(),
		g_archive_probe.command_set_ranger_slot4_command,
		g_archive_probe.command_set_ranger_slot4_weapon_slot,
		slot4_upgrade_json.c_str(),
		slot11_json.c_str(),
		g_archive_probe.command_set_ranger_slot11_command,
		slot13_json.c_str(),
		g_archive_probe.command_set_ranger_slot13_command,
		slot14_json.c_str(),
		g_archive_probe.command_set_ranger_slot14_command);

	return buffer;
}

std::string build_control_bar_scheme_probe_json()
{
	char buffer[9000];
	const std::string source_json = json_escape(g_archive_probe.control_bar_scheme_source);
	const std::string default_queue_json =
		json_escape(g_archive_probe.control_bar_scheme_default_queue_image);
	const std::string default_right_hud_json =
		json_escape(g_archive_probe.control_bar_scheme_default_right_hud_image);
	const std::string default_base_json =
		json_escape(g_archive_probe.control_bar_scheme_default_base_image);
	const std::string america_side_json =
		json_escape(g_archive_probe.control_bar_scheme_america_side);
	const std::string america_queue_json =
		json_escape(g_archive_probe.control_bar_scheme_america_queue_image);
	const std::string america_right_hud_json =
		json_escape(g_archive_probe.control_bar_scheme_america_right_hud_image);
	const std::string america_command_marker_json =
		json_escape(g_archive_probe.control_bar_scheme_america_command_marker_image);
	const std::string america_power_purchase_json =
		json_escape(g_archive_probe.control_bar_scheme_america_power_purchase_image);
	const std::string america_base_json =
		json_escape(g_archive_probe.control_bar_scheme_america_base_image);
	const std::string gla_side_json =
		json_escape(g_archive_probe.control_bar_scheme_gla_side);
	const std::string gla_right_hud_json =
		json_escape(g_archive_probe.control_bar_scheme_gla_right_hud_image);
	const std::string gla_command_marker_json =
		json_escape(g_archive_probe.control_bar_scheme_gla_command_marker_image);
	const std::string gla_power_purchase_json =
		json_escape(g_archive_probe.control_bar_scheme_gla_power_purchase_image);
	const std::string gla_base_json =
		json_escape(g_archive_probe.control_bar_scheme_gla_base_image);
	const std::string china_side_json =
		json_escape(g_archive_probe.control_bar_scheme_china_side);
	const std::string china_right_hud_json =
		json_escape(g_archive_probe.control_bar_scheme_china_right_hud_image);
	const std::string china_command_marker_json =
		json_escape(g_archive_probe.control_bar_scheme_china_command_marker_image);
	const std::string china_power_purchase_json =
		json_escape(g_archive_probe.control_bar_scheme_china_power_purchase_image);
	const std::string china_gen_arrow_json =
		json_escape(g_archive_probe.control_bar_scheme_china_gen_arrow_image);
	const std::string china_base_json =
		json_escape(g_archive_probe.control_bar_scheme_china_base_image);

	std::snprintf(buffer, sizeof(buffer),
		"{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,\"defaultBytes\":%zu,"
		"\"source\":\"%s\",\"loadedArchives\":%s,"
		"\"fileExists\":%s,\"defaultFileExists\":%s,"
		"\"nameKeyGeneratorLoaded\":%s,\"mappedImagesLoaded\":%s,"
		"\"controlBarLoaded\":%s,\"originalDefaultIniLoad\":%s,"
		"\"originalIniLoad\":%s,\"parsedFields\":%zu,\"mappedImages\":%zu,"
		"\"default\":{\"found\":%s,\"queueImage\":\"%s\","
		"\"rightHUDImage\":\"%s\",\"baseImage\":\"%s\","
		"\"baseLayer\":%d,\"baseWidth\":%d,\"baseHeight\":%d},"
		"\"america\":{\"found\":%s,\"side\":\"%s\",\"queueImage\":\"%s\","
		"\"rightHUDImage\":\"%s\",\"commandMarkerImage\":\"%s\","
		"\"powerPurchaseImage\":\"%s\",\"baseImage\":\"%s\","
		"\"screenX\":%d,\"screenY\":%d,\"baseLayer\":%d,"
		"\"baseX\":%d,\"baseY\":%d,\"baseWidth\":%d,\"baseHeight\":%d},"
		"\"gla\":{\"found\":%s,\"side\":\"%s\",\"rightHUDImage\":\"%s\","
		"\"commandMarkerImage\":\"%s\",\"powerPurchaseImage\":\"%s\","
		"\"baseImage\":\"%s\"},"
		"\"china\":{\"found\":%s,\"side\":\"%s\",\"rightHUDImage\":\"%s\","
		"\"commandMarkerImage\":\"%s\",\"powerPurchaseImage\":\"%s\","
		"\"genArrowImage\":\"%s\",\"baseImage\":\"%s\"}}",
		g_archive_probe.control_bar_scheme_attempted ? "true" : "false",
		g_archive_probe.control_bar_scheme_ok ? "true" : "false",
		g_archive_probe.control_bar_scheme_bytes,
		g_archive_probe.control_bar_scheme_default_bytes,
		source_json.c_str(),
		g_archive_probe.control_bar_scheme_loaded_archives ? "true" : "false",
		g_archive_probe.control_bar_scheme_file_exists ? "true" : "false",
		g_archive_probe.control_bar_scheme_default_file_exists ? "true" : "false",
		g_archive_probe.control_bar_scheme_name_key_generator_loaded ? "true" : "false",
		g_archive_probe.control_bar_scheme_mapped_images_loaded ? "true" : "false",
		g_archive_probe.control_bar_scheme_control_bar_loaded ? "true" : "false",
		g_archive_probe.control_bar_scheme_original_default_ini_load ? "true" : "false",
		g_archive_probe.control_bar_scheme_original_ini_load ? "true" : "false",
		g_archive_probe.control_bar_scheme_parsed_fields,
		g_archive_probe.control_bar_scheme_mapped_image_count,
		g_archive_probe.control_bar_scheme_default_found ? "true" : "false",
		default_queue_json.c_str(),
		default_right_hud_json.c_str(),
		default_base_json.c_str(),
		g_archive_probe.control_bar_scheme_default_base_layer,
		g_archive_probe.control_bar_scheme_default_base_width,
		g_archive_probe.control_bar_scheme_default_base_height,
		g_archive_probe.control_bar_scheme_america_found ? "true" : "false",
		america_side_json.c_str(),
		america_queue_json.c_str(),
		america_right_hud_json.c_str(),
		america_command_marker_json.c_str(),
		america_power_purchase_json.c_str(),
		america_base_json.c_str(),
		g_archive_probe.control_bar_scheme_america_screen_x,
		g_archive_probe.control_bar_scheme_america_screen_y,
		g_archive_probe.control_bar_scheme_america_base_layer,
		g_archive_probe.control_bar_scheme_america_base_x,
		g_archive_probe.control_bar_scheme_america_base_y,
		g_archive_probe.control_bar_scheme_america_base_width,
		g_archive_probe.control_bar_scheme_america_base_height,
		g_archive_probe.control_bar_scheme_gla_found ? "true" : "false",
		gla_side_json.c_str(),
		gla_right_hud_json.c_str(),
		gla_command_marker_json.c_str(),
		gla_power_purchase_json.c_str(),
		gla_base_json.c_str(),
		g_archive_probe.control_bar_scheme_china_found ? "true" : "false",
		china_side_json.c_str(),
		china_right_hud_json.c_str(),
		china_command_marker_json.c_str(),
		china_power_purchase_json.c_str(),
		china_gen_arrow_json.c_str(),
		china_base_json.c_str());

	return buffer;
}

std::string build_crate_probe_json()
{
	char buffer[9000];
	const std::string source_json = json_escape(g_archive_probe.crate_source);
	const std::string salvage_object_json =
		json_escape(g_archive_probe.crate_salvage_object_name);
	const std::string elite_first_json =
		json_escape(g_archive_probe.crate_elite_first_object);
	const std::string elite_second_json =
		json_escape(g_archive_probe.crate_elite_second_object);
	const std::string heroic_first_json =
		json_escape(g_archive_probe.crate_heroic_first_object);
	const std::string heroic_third_json =
		json_escape(g_archive_probe.crate_heroic_third_object);
	const std::string gla02_100_object_json =
		json_escape(g_archive_probe.crate_gla02_100_object);
	const std::string gla02_2500_object_json =
		json_escape(g_archive_probe.crate_gla02_2500_object);

	std::snprintf(buffer, sizeof(buffer),
		"{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"scienceBytes\":%zu,\"filteredBytes\":%zu,\"source\":\"%s\","
		"\"loadedArchives\":%s,\"fileExists\":%s,"
		"\"scienceFileExists\":%s,\"gameTextLoaded\":%s,"
		"\"nameKeyGeneratorLoaded\":%s,"
		"\"scienceOriginalIniLoad\":%s,\"originalIniLoad\":%s,"
		"\"filteredFromShipped\":%s,\"filteredBlocks\":%zu,"
		"\"parsedFields\":%zu,\"templates\":%zu,"
		"\"salvage\":{\"found\":%s,\"creationChance\":%.3f,"
		"\"salvagerKindOf\":%s,\"killerScienceValid\":%s,"
		"\"objects\":%zu,\"object\":\"%s\",\"objectChance\":%.3f},"
		"\"elite\":{\"found\":%s,\"creationChance\":%.3f,"
		"\"veterancyLevel\":%d,\"objects\":%zu,"
		"\"firstObject\":\"%s\",\"firstChance\":%.3f,"
		"\"secondObject\":\"%s\",\"secondChance\":%.3f},"
		"\"heroic\":{\"found\":%s,\"creationChance\":%.3f,"
		"\"veterancyLevel\":%d,\"objects\":%zu,"
		"\"firstObject\":\"%s\",\"firstChance\":%.3f,"
		"\"thirdObject\":\"%s\",\"thirdChance\":%.3f},"
		"\"gla02\":{\"hundred\":{\"found\":%s,\"ownedByMaker\":%s,"
		"\"object\":\"%s\",\"chance\":%.3f},"
		"\"twentyFiveHundred\":{\"found\":%s,\"ownedByMaker\":%s,"
		"\"object\":\"%s\",\"chance\":%.3f}}}",
		g_archive_probe.crate_attempted ? "true" : "false",
		g_archive_probe.crate_ok ? "true" : "false",
		g_archive_probe.crate_bytes,
		g_archive_probe.crate_science_bytes,
		g_archive_probe.crate_filtered_bytes,
		source_json.c_str(),
		g_archive_probe.crate_loaded_archives ? "true" : "false",
		g_archive_probe.crate_file_exists ? "true" : "false",
		g_archive_probe.crate_science_file_exists ? "true" : "false",
		g_archive_probe.crate_game_text_loaded ? "true" : "false",
		g_archive_probe.crate_name_key_generator_loaded ? "true" : "false",
		g_archive_probe.crate_science_original_ini_load ? "true" : "false",
		g_archive_probe.crate_original_ini_load ? "true" : "false",
		g_archive_probe.crate_filtered_from_shipped ? "true" : "false",
		g_archive_probe.crate_filtered_blocks,
		g_archive_probe.crate_parsed_fields,
		g_archive_probe.crate_template_count,
		g_archive_probe.crate_salvage_found ? "true" : "false",
		g_archive_probe.crate_salvage_creation_chance,
		g_archive_probe.crate_salvage_salvager_kindof ? "true" : "false",
		g_archive_probe.crate_salvage_killer_science_valid ? "true" : "false",
		g_archive_probe.crate_salvage_object_count,
		salvage_object_json.c_str(),
		g_archive_probe.crate_salvage_object_chance,
		g_archive_probe.crate_elite_found ? "true" : "false",
		g_archive_probe.crate_elite_creation_chance,
		g_archive_probe.crate_elite_veterancy_level,
		g_archive_probe.crate_elite_object_count,
		elite_first_json.c_str(),
		g_archive_probe.crate_elite_first_chance,
		elite_second_json.c_str(),
		g_archive_probe.crate_elite_second_chance,
		g_archive_probe.crate_heroic_found ? "true" : "false",
		g_archive_probe.crate_heroic_creation_chance,
		g_archive_probe.crate_heroic_veterancy_level,
		g_archive_probe.crate_heroic_object_count,
		heroic_first_json.c_str(),
		g_archive_probe.crate_heroic_first_chance,
		heroic_third_json.c_str(),
		g_archive_probe.crate_heroic_third_chance,
		g_archive_probe.crate_gla02_100_found ? "true" : "false",
		g_archive_probe.crate_gla02_100_owned_by_maker ? "true" : "false",
		gla02_100_object_json.c_str(),
		g_archive_probe.crate_gla02_100_object_chance,
		g_archive_probe.crate_gla02_2500_found ? "true" : "false",
		g_archive_probe.crate_gla02_2500_owned_by_maker ? "true" : "false",
		gla02_2500_object_json.c_str(),
		g_archive_probe.crate_gla02_2500_object_chance);

	return buffer;
}

std::string build_draw_group_info_probe_json()
{
	char buffer[3000];
	const std::string source_json = json_escape(g_archive_probe.draw_group_info_source);
	const std::string font_name_json = json_escape(g_archive_probe.draw_group_info_font_name);

	std::snprintf(buffer, sizeof(buffer),
		"{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"source\":\"%s\",\"loadedArchives\":%s,\"fileExists\":%s,"
		"\"originalIniLoad\":%s,\"parsedFields\":%zu,"
		"\"fontName\":\"%s\",\"fontSize\":%d,\"fontIsBold\":%s,"
		"\"usePlayerColor\":%s,\"colorForText\":%u,"
		"\"colorForTextDropShadow\":%u,"
		"\"dropShadowOffsetX\":%d,\"dropShadowOffsetY\":%d,"
		"\"usingPixelOffsetX\":%s,\"usingPixelOffsetY\":%s,"
		"\"pixelOffsetX\":%d,\"pixelOffsetY\":%d,"
		"\"percentOffsetX\":%.4f,\"percentOffsetY\":%.4f}",
		g_archive_probe.draw_group_info_attempted ? "true" : "false",
		g_archive_probe.draw_group_info_ok ? "true" : "false",
		g_archive_probe.draw_group_info_bytes,
		source_json.c_str(),
		g_archive_probe.draw_group_info_loaded_archives ? "true" : "false",
		g_archive_probe.draw_group_info_file_exists ? "true" : "false",
		g_archive_probe.draw_group_info_original_ini_load ? "true" : "false",
		g_archive_probe.draw_group_info_parsed_fields,
		font_name_json.c_str(),
		g_archive_probe.draw_group_info_font_size,
		g_archive_probe.draw_group_info_font_is_bold ? "true" : "false",
		g_archive_probe.draw_group_info_use_player_color ? "true" : "false",
		g_archive_probe.draw_group_info_color_for_text,
		g_archive_probe.draw_group_info_color_for_text_drop_shadow,
		g_archive_probe.draw_group_info_drop_shadow_offset_x,
		g_archive_probe.draw_group_info_drop_shadow_offset_y,
		g_archive_probe.draw_group_info_using_pixel_offset_x ? "true" : "false",
		g_archive_probe.draw_group_info_using_pixel_offset_y ? "true" : "false",
		g_archive_probe.draw_group_info_pixel_offset_x,
		g_archive_probe.draw_group_info_pixel_offset_y,
		g_archive_probe.draw_group_info_percent_offset_x,
		g_archive_probe.draw_group_info_percent_offset_y);

	return buffer;
}

std::string build_mapped_image_probe_json()
{
	char buffer[5000];
	const std::string source_json = json_escape(g_archive_probe.mapped_image_source);
	const std::string sa_chinook_texture_json =
		json_escape(g_archive_probe.mapped_image_sa_chinook_texture);
	const std::string watermark_china_texture_json =
		json_escape(g_archive_probe.mapped_image_watermark_china_texture);

	std::snprintf(buffer, sizeof(buffer),
		"{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"source\":\"%s\",\"loadedArchives\":%s,\"fileExists\":%s,"
		"\"nameKeyGeneratorLoaded\":%s,\"originalIniLoad\":%s,"
		"\"parsedFields\":%zu,\"files\":%zu,\"images\":%zu,"
		"\"saChinook\":{\"found\":%s,\"texture\":\"%s\","
		"\"textureWidth\":%d,\"textureHeight\":%d,"
		"\"width\":%d,\"height\":%d,\"status\":%u,"
		"\"uv\":{\"loX\":%.6f,\"loY\":%.6f,\"hiX\":%.6f,\"hiY\":%.6f}},"
		"\"watermarkChina\":{\"found\":%s,\"texture\":\"%s\","
		"\"width\":%d,\"height\":%d,\"status\":%u,\"rotated\":%s}}",
		g_archive_probe.mapped_image_attempted ? "true" : "false",
		g_archive_probe.mapped_image_ok ? "true" : "false",
		g_archive_probe.mapped_image_bytes,
		source_json.c_str(),
		g_archive_probe.mapped_image_loaded_archives ? "true" : "false",
		g_archive_probe.mapped_image_file_exists ? "true" : "false",
		g_archive_probe.mapped_image_name_key_generator_loaded ? "true" : "false",
		g_archive_probe.mapped_image_original_ini_load ? "true" : "false",
		g_archive_probe.mapped_image_parsed_fields,
		g_archive_probe.mapped_image_file_count,
		g_archive_probe.mapped_image_count,
		g_archive_probe.mapped_image_sa_chinook_found ? "true" : "false",
		sa_chinook_texture_json.c_str(),
		g_archive_probe.mapped_image_sa_chinook_texture_width,
		g_archive_probe.mapped_image_sa_chinook_texture_height,
		g_archive_probe.mapped_image_sa_chinook_width,
		g_archive_probe.mapped_image_sa_chinook_height,
		g_archive_probe.mapped_image_sa_chinook_status,
		g_archive_probe.mapped_image_sa_chinook_uv_lo_x,
		g_archive_probe.mapped_image_sa_chinook_uv_lo_y,
		g_archive_probe.mapped_image_sa_chinook_uv_hi_x,
		g_archive_probe.mapped_image_sa_chinook_uv_hi_y,
		g_archive_probe.mapped_image_watermark_china_found ? "true" : "false",
		watermark_china_texture_json.c_str(),
		g_archive_probe.mapped_image_watermark_china_width,
		g_archive_probe.mapped_image_watermark_china_height,
		g_archive_probe.mapped_image_watermark_china_status,
		g_archive_probe.mapped_image_watermark_china_rotated ? "true" : "false");

	return buffer;
}

std::string build_challenge_mode_probe_json()
{
	char buffer[5200];
	const std::string source_json = json_escape(g_archive_probe.challenge_mode_source);
	const std::string air_force_template_json =
		json_escape(g_archive_probe.challenge_mode_air_force_player_template);
	const std::string air_force_bio_name_json =
		json_escape(g_archive_probe.challenge_mode_air_force_bio_name);
	const std::string air_force_campaign_json =
		json_escape(g_archive_probe.challenge_mode_air_force_campaign);
	const std::string air_force_portrait_left_json =
		json_escape(g_archive_probe.challenge_mode_air_force_portrait_left);
	const std::string air_force_portrait_right_json =
		json_escape(g_archive_probe.challenge_mode_air_force_portrait_right);
	const std::string air_force_selection_sound_json =
		json_escape(g_archive_probe.challenge_mode_air_force_selection_sound);
	const std::string air_force_preview_sound_json =
		json_escape(g_archive_probe.challenge_mode_air_force_preview_sound);
	const std::string air_force_name_sound_json =
		json_escape(g_archive_probe.challenge_mode_air_force_name_sound);
	const std::string toxin_template_json =
		json_escape(g_archive_probe.challenge_mode_toxin_player_template);
	const std::string toxin_campaign_json =
		json_escape(g_archive_probe.challenge_mode_toxin_campaign);
	const std::string toxin_selection_sound_json =
		json_escape(g_archive_probe.challenge_mode_toxin_selection_sound);
	const std::string disabled_campaign_json =
		json_escape(g_archive_probe.challenge_mode_disabled_slot_campaign);
	const std::string disabled_selection_sound_json =
		json_escape(g_archive_probe.challenge_mode_disabled_slot_selection_sound);

	std::snprintf(buffer, sizeof(buffer),
		"{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"source\":\"%s\",\"loadedArchives\":%s,\"fileExists\":%s,"
		"\"nameKeyGeneratorLoaded\":%s,\"mappedImagesLoaded\":%s,"
		"\"challengeGeneralsLoaded\":%s,\"originalIniLoad\":%s,"
		"\"parsedFields\":%zu,\"mappedImages\":%zu,"
		"\"personas\":%zu,\"enabledPersonas\":%zu,\"playerTemplates\":%zu,"
		"\"airForce\":{\"found\":%s,\"startsEnabled\":%s,"
		"\"playerTemplate\":\"%s\",\"bioName\":\"%s\",\"campaign\":\"%s\","
		"\"portraitLeft\":\"%s\",\"portraitRight\":\"%s\","
		"\"selectionSound\":\"%s\",\"previewSound\":\"%s\","
		"\"nameSound\":\"%s\",\"smallPortrait\":%s,\"largePortrait\":%s,"
		"\"defeatedImage\":%s,\"victoriousImage\":%s},"
		"\"toxin\":{\"found\":%s,\"startsEnabled\":%s,"
		"\"playerTemplate\":\"%s\",\"campaign\":\"%s\","
		"\"selectionSound\":\"%s\"},"
		"\"disabledSlot\":{\"found\":%s,\"startsDisabled\":%s,"
		"\"campaign\":\"%s\",\"selectionSound\":\"%s\","
		"\"smallPortrait\":%s}}",
		g_archive_probe.challenge_mode_attempted ? "true" : "false",
		g_archive_probe.challenge_mode_ok ? "true" : "false",
		g_archive_probe.challenge_mode_bytes,
		source_json.c_str(),
		g_archive_probe.challenge_mode_loaded_archives ? "true" : "false",
		g_archive_probe.challenge_mode_file_exists ? "true" : "false",
		g_archive_probe.challenge_mode_name_key_generator_loaded ? "true" : "false",
		g_archive_probe.challenge_mode_mapped_images_loaded ? "true" : "false",
		g_archive_probe.challenge_mode_challenge_generals_loaded ? "true" : "false",
		g_archive_probe.challenge_mode_original_ini_load ? "true" : "false",
		g_archive_probe.challenge_mode_parsed_fields,
		g_archive_probe.challenge_mode_mapped_image_count,
		g_archive_probe.challenge_mode_persona_count,
		g_archive_probe.challenge_mode_enabled_persona_count,
		g_archive_probe.challenge_mode_player_template_count,
		g_archive_probe.challenge_mode_air_force_found ? "true" : "false",
		g_archive_probe.challenge_mode_air_force_starts_enabled ? "true" : "false",
		air_force_template_json.c_str(),
		air_force_bio_name_json.c_str(),
		air_force_campaign_json.c_str(),
		air_force_portrait_left_json.c_str(),
		air_force_portrait_right_json.c_str(),
		air_force_selection_sound_json.c_str(),
		air_force_preview_sound_json.c_str(),
		air_force_name_sound_json.c_str(),
		g_archive_probe.challenge_mode_air_force_small_portrait_loaded ? "true" : "false",
		g_archive_probe.challenge_mode_air_force_large_portrait_loaded ? "true" : "false",
		g_archive_probe.challenge_mode_air_force_defeated_image_loaded ? "true" : "false",
		g_archive_probe.challenge_mode_air_force_victorious_image_loaded ? "true" : "false",
		g_archive_probe.challenge_mode_toxin_found ? "true" : "false",
		g_archive_probe.challenge_mode_toxin_starts_enabled ? "true" : "false",
		toxin_template_json.c_str(),
		toxin_campaign_json.c_str(),
		toxin_selection_sound_json.c_str(),
		g_archive_probe.challenge_mode_disabled_slot_found ? "true" : "false",
		g_archive_probe.challenge_mode_disabled_slot_starts_disabled ? "true" : "false",
		disabled_campaign_json.c_str(),
		disabled_selection_sound_json.c_str(),
		g_archive_probe.challenge_mode_disabled_slot_small_portrait_loaded ? "true" : "false");

	return buffer;
}

std::string build_game_network_probe_json()
{
	char buffer[4000];
	const std::string source_json = json_escape(g_game_network_probe.source);
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"%s\",\"attempted\":%s,\"ok\":%s,"
		"\"commandIds\":{\"ok\":%s,\"first\":%u,\"second\":%u,"
		"\"maxFramesAhead\":%d,\"minRunAhead\":%d,\"frameDataLength\":%d,"
		"\"framesToKeep\":%d},"
		"\"frameData\":{\"ok\":%s,\"frame\":%d,\"frameCommandCount\":%d,"
		"\"readyState\":%d},"
		"\"frameDataManager\":{\"ok\":%s,\"quitFrame\":%d,"
		"\"readyState\":%d},"
		"\"packetRoundTrip\":{\"ok\":%s,\"length\":%d,\"commands\":%d,"
		"\"relay\":%d,\"executionFrame\":%d,\"playerId\":%d,"
		"\"commandId\":%d,\"frameCommandCount\":%d}}",
		source_json.c_str(),
		g_game_network_probe.attempted ? "true" : "false",
		g_game_network_probe.ok ? "true" : "false",
		g_game_network_probe.command_ids_ok ? "true" : "false",
		g_game_network_probe.first_command_id,
		g_game_network_probe.second_command_id,
		g_game_network_probe.max_frames_ahead,
		g_game_network_probe.min_run_ahead,
		g_game_network_probe.frame_data_length,
		g_game_network_probe.frames_to_keep,
		g_game_network_probe.frame_data_ok ? "true" : "false",
		g_game_network_probe.frame,
		g_game_network_probe.frame_command_count,
		g_game_network_probe.frame_ready_state,
		g_game_network_probe.frame_data_manager_ok ? "true" : "false",
		g_game_network_probe.manager_quit_frame,
		g_game_network_probe.manager_ready_state,
		g_game_network_probe.packet_round_trip_ok ? "true" : "false",
		g_game_network_probe.packet_length,
		g_game_network_probe.packet_command_count,
		g_game_network_probe.packet_relay,
		g_game_network_probe.packet_execution_frame,
		g_game_network_probe.packet_player_id,
		g_game_network_probe.packet_command_id,
		g_game_network_probe.packet_frame_command_count);
	return buffer;
}

std::string build_file_system_probe_json()
{
	char buffer[3600];
	const std::string source_json = json_escape(g_file_system_probe.source);
	const std::string local_path_json = json_escape(g_file_system_probe.local_path);
	const std::string archive_path_json = json_escape(g_file_system_probe.archive_path);
	const std::string archive_owner_json = json_escape(g_file_system_probe.archive_owner);
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"%s\",\"attempted\":%s,\"ok\":%s,"
		"\"local\":{\"ok\":%s,\"path\":\"%s\",\"bytes\":%d,"
		"\"directory\":%s,\"write\":%s,\"exists\":%s,\"cache\":%s,"
		"\"info\":%s,\"infoSize\":%d,\"list\":%s,\"read\":%s,"
		"\"missingCache\":%s},"
		"\"archive\":{\"attempted\":%s,\"loaded\":%s,\"ok\":%s,"
		"\"path\":\"%s\",\"owner\":\"%s\",\"indexedFiles\":%zu,"
		"\"exists\":%s,\"info\":%s,\"infoSize\":%d,\"list\":%s,"
		"\"read\":%s,\"bytes\":%d,\"ownerLookup\":%s}}",
		source_json.c_str(),
		g_file_system_probe.attempted ? "true" : "false",
		g_file_system_probe.ok ? "true" : "false",
		g_file_system_probe.local_ok ? "true" : "false",
		local_path_json.c_str(),
		g_file_system_probe.local_bytes,
		g_file_system_probe.local_directory_ok ? "true" : "false",
		g_file_system_probe.local_write_ok ? "true" : "false",
		g_file_system_probe.local_exists_ok ? "true" : "false",
		g_file_system_probe.local_cache_ok ? "true" : "false",
		g_file_system_probe.local_info_ok ? "true" : "false",
		g_file_system_probe.local_info_size,
		g_file_system_probe.local_list_ok ? "true" : "false",
		g_file_system_probe.local_read_ok ? "true" : "false",
		g_file_system_probe.missing_cache_ok ? "true" : "false",
		g_file_system_probe.archive_attempted ? "true" : "false",
		g_file_system_probe.archive_loaded ? "true" : "false",
		g_file_system_probe.archive_ok ? "true" : "false",
		archive_path_json.c_str(),
		archive_owner_json.c_str(),
		g_file_system_probe.archive_indexed_file_count,
		g_file_system_probe.archive_exists_ok ? "true" : "false",
		g_file_system_probe.archive_info_ok ? "true" : "false",
		g_file_system_probe.archive_info_size,
		g_file_system_probe.archive_list_ok ? "true" : "false",
		g_file_system_probe.archive_read_ok ? "true" : "false",
		g_file_system_probe.archive_bytes,
		g_file_system_probe.archive_owner_ok ? "true" : "false");
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
		run_original_file_system_probe();
		run_original_game_network_probe();
		probe_registered_archive_set_for_boot();
		log_boot_state();
	}
}

void tick_frame()
{
	if (g_booted) {
		++g_frame;
		cnc_port_service_original_wndproc_messages();
		cnc_port_update_original_keyboard_frame_input();
		cnc_port_update_original_mouse_frame_input();
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
	char buffer[256000];
	const std::string archive_path_json = json_escape(g_archive_probe.archive_path);
	const std::string armor_source_json = json_escape(g_archive_probe.armor_source);
	const std::string damage_fx_probe_json = build_damage_fx_probe_json();
	const std::string fx_list_probe_json = build_fx_list_probe_json();
	const std::string object_creation_list_probe_json =
		build_object_creation_list_probe_json();
	const std::string weapon_probe_json = build_weapon_probe_json();
	const std::string ai_data_probe_json = build_ai_data_probe_json();
	const std::string locomotor_probe_json = build_locomotor_probe_json();
	const std::string science_source_json = json_escape(g_archive_probe.science_source);
	const std::string upgrade_probe_json = build_upgrade_probe_json();
	const std::string command_button_probe_json = build_command_button_probe_json();
	const std::string command_set_probe_json = build_command_set_probe_json();
	const std::string control_bar_scheme_probe_json = build_control_bar_scheme_probe_json();
	const std::string crate_probe_json = build_crate_probe_json();
	const std::string draw_group_info_probe_json = build_draw_group_info_probe_json();
	const std::string mapped_image_probe_json = build_mapped_image_probe_json();
	const std::string challenge_mode_probe_json = build_challenge_mode_probe_json();
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
	const std::string game_text_language_json =
		json_escape(g_archive_probe.game_text_language);
	const std::string game_text_csf_path_json =
		json_escape(g_archive_probe.game_text_csf_path);
	const std::string archive_mount_directory_json = json_escape(g_archive_mount.directory);
	const std::string archive_mount_file_mask_json = json_escape(g_archive_mount.file_mask);
	const std::string browser_runtime_assets_json = wasm_browser_runtime_assets_state_json();
	const std::string startup_asset_status_json = json_escape(startup_asset_status());
	const std::string startup_asset_message_json = json_escape(startup_asset_message());
	const std::string data_summary_json = build_data_summary_json();
	const std::string original_engine_startup_json = build_original_engine_startup_json();
	const std::string global_data_source_json = json_escape(g_global_data_probe.source);
	const std::string global_data_user_data_path_json =
		json_escape(g_global_data_probe.user_data_path);
	const std::string global_data_shell_map_name_json =
		json_escape(g_global_data_probe.shell_map_name);
	const std::string command_line_source_json = json_escape(g_command_line_probe.source);
	const std::string cd_manager_source_json = json_escape(g_cd_manager_probe.source);
	const std::string file_system_probe_json = build_file_system_probe_json();
	const std::string game_network_probe_json = build_game_network_probe_json();
	const std::string browser_input_json = build_browser_input_json();
	const char *original_keyboard_frame_input_json =
		cnc_port_probe_original_keyboard_frame_input();
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
		"\"browserInput\":%s,"
		"\"originalKeyboardFrameInput\":%s,"
		"\"assetProbe\":{\"attempted\":%s,\"ok\":%s,\"loaded\":%s,"
		"\"archive\":\"%s\",\"reader\":\"Win32BIGFileSystem\","
		"\"indexedFiles\":%zu,\"sampleBytes\":%zu,"
		"\"inizh\":{\"defaultGameDataIni\":%s,\"gameDataIni\":%s,"
		"\"armorIni\":%s,\"challengeModeIni\":%s,\"damageFXIni\":%s,"
		"\"defaultFXListIni\":%s,\"fxListIni\":%s,"
		"\"defaultObjectCreationListIni\":%s,\"objectCreationListIni\":%s,"
		"\"defaultAIDataIni\":%s,\"aiDataIni\":%s,\"locomotorIni\":%s,"
		"\"commandButtonIni\":%s,"
		"\"commandSetIni\":%s,\"controlBarSchemeIni\":%s,"
		"\"defaultControlBarSchemeIni\":%s,\"crateIni\":%s,"
		"\"defaultCrateIni\":%s,\"rankIni\":%s,"
		"\"defaultPlayerTemplateIni\":%s,\"playerTemplateIni\":%s,"
		"\"defaultScienceIni\":%s,\"scienceIni\":%s,"
		"\"defaultSpecialPowerIni\":%s,\"specialPowerIni\":%s,"
		"\"defaultMultiplayerIni\":%s,\"multiplayerIni\":%s,"
		"\"defaultTerrainIni\":%s,\"terrainIni\":%s,"
		"\"defaultRoadsIni\":%s,\"roadsIni\":%s,"
		"\"defaultUpgradeIni\":%s,\"upgradeIni\":%s,"
		"\"defaultObjectIni\":%s,\"objectIniFiles\":%zu,"
		"\"drawGroupInfoIni\":%s,"
		"\"defaultWaterIni\":%s,\"waterIni\":%s,"
		"\"defaultWeatherIni\":%s,\"weatherIni\":%s,"
		"\"commandMapIni\":%s,\"englishCommandMapIni\":%s,"
		"\"videoIni\":%s,\"defaultVideoIni\":%s,"
		"\"weaponIni\":%s,\"particleSystemIni\":%s},"
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
		"\"damageFX\":%s,"
		"\"fxList\":%s,"
		"\"objectCreationList\":%s,"
		"\"weapon\":%s,"
		"\"aiData\":%s,"
		"\"locomotor\":%s,"
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
		"\"commandSet\":%s,"
		"\"controlBarScheme\":%s,"
		"\"crate\":%s,"
		"\"drawGroupInfo\":%s,"
		"\"mappedImages\":%s,"
		"\"challengeMode\":%s,"
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
		"\"language\":\"%s\",\"csfPath\":\"%s\",\"selectedCsf\":%s,"
		"\"titleLabel\":%s,\"controlBarLabel\":%s,\"controlBarLabels\":%zu}},"
		"\"archiveMount\":{\"registered\":%s,\"directory\":\"%s\","
		"\"fileMask\":\"%s\",\"archiveCount\":%d,\"totalBytes\":%.0f,"
		"\"bootProbe\":{\"attempted\":%s,\"ok\":%s,\"indexedFiles\":%zu}},"
		"\"browserRuntimeAssets\":%s,"
		"\"startupAssets\":{\"ok\":%s,\"status\":\"%s\",\"message\":\"%s\","
		"\"archiveSetRegistered\":%s,\"bootProbeAttempted\":%s,\"bootProbeOk\":%s,"
		"\"required\":{\"inizh\":%s,\"armor\":%s,\"damageFX\":%s,\"fxList\":%s,\"science\":%s,"
		"\"objectCreationList\":%s,"
		"\"weapon\":%s,\"particleSystem\":%s,\"aiData\":%s,"
		"\"locomotor\":%s,"
		"\"upgrade\":%s,\"commandButton\":%s,"
		"\"commandSet\":%s,\"controlBarScheme\":%s,\"crate\":%s,"
		"\"specialPower\":%s,\"playerTemplate\":%s,\"multiplayer\":%s,"
		"\"terrain\":%s,\"terrainRoads\":%s,"
		"\"gameData\":%s,\"water\":%s,\"weather\":%s,"
		"\"video\":%s,\"gameText\":%s,\"mapCache\":%s}},"
		"\"dataSummary\":%s,"
		"\"originalEngineStartup\":%s,"
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
		"\"fileSystemProbe\":%s,"
		"\"gameNetworkProbe\":%s,"
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
		browser_input_json.c_str(),
		original_keyboard_frame_input_json,
		g_archive_probe.attempted ? "true" : "false",
		g_archive_probe.ok ? "true" : "false",
		g_archive_probe.loaded ? "true" : "false",
		archive_path_json.c_str(),
		g_archive_probe.indexed_file_count,
		g_archive_probe.sample_bytes,
		g_archive_probe.has_default_game_data_ini ? "true" : "false",
		g_archive_probe.has_game_data_ini ? "true" : "false",
		g_archive_probe.has_armor_ini ? "true" : "false",
		g_archive_probe.has_challenge_mode_ini ? "true" : "false",
		g_archive_probe.has_damage_fx_ini ? "true" : "false",
		g_archive_probe.has_default_fx_list_ini ? "true" : "false",
		g_archive_probe.has_fx_list_ini ? "true" : "false",
		g_archive_probe.has_default_object_creation_list_ini ? "true" : "false",
		g_archive_probe.has_object_creation_list_ini ? "true" : "false",
		g_archive_probe.has_default_ai_data_ini ? "true" : "false",
		g_archive_probe.has_ai_data_ini ? "true" : "false",
		g_archive_probe.has_locomotor_ini ? "true" : "false",
		g_archive_probe.has_command_button_ini ? "true" : "false",
		g_archive_probe.has_command_set_ini ? "true" : "false",
		g_archive_probe.has_control_bar_scheme_ini ? "true" : "false",
		g_archive_probe.has_default_control_bar_scheme_ini ? "true" : "false",
		g_archive_probe.has_crate_ini ? "true" : "false",
		g_archive_probe.has_default_crate_ini ? "true" : "false",
		g_archive_probe.has_rank_ini ? "true" : "false",
		g_archive_probe.has_default_player_template_ini ? "true" : "false",
		g_archive_probe.has_player_template_ini ? "true" : "false",
		g_archive_probe.has_default_science_ini ? "true" : "false",
		g_archive_probe.has_science_ini ? "true" : "false",
		g_archive_probe.has_default_special_power_ini ? "true" : "false",
		g_archive_probe.has_special_power_ini ? "true" : "false",
		g_archive_probe.has_default_multiplayer_ini ? "true" : "false",
		g_archive_probe.has_multiplayer_ini ? "true" : "false",
		g_archive_probe.has_default_terrain_ini ? "true" : "false",
		g_archive_probe.has_terrain_ini ? "true" : "false",
		g_archive_probe.has_default_roads_ini ? "true" : "false",
		g_archive_probe.has_roads_ini ? "true" : "false",
		g_archive_probe.has_default_upgrade_ini ? "true" : "false",
		g_archive_probe.has_upgrade_ini ? "true" : "false",
		g_archive_probe.has_default_object_ini ? "true" : "false",
		g_archive_probe.object_ini_file_count,
		g_archive_probe.has_draw_group_info_ini ? "true" : "false",
		g_archive_probe.has_default_water_ini ? "true" : "false",
		g_archive_probe.has_water_ini ? "true" : "false",
		g_archive_probe.has_default_weather_ini ? "true" : "false",
		g_archive_probe.has_weather_ini ? "true" : "false",
		g_archive_probe.has_command_map_ini ? "true" : "false",
		g_archive_probe.has_english_command_map_ini ? "true" : "false",
		g_archive_probe.has_video_ini ? "true" : "false",
		g_archive_probe.has_default_video_ini ? "true" : "false",
		g_archive_probe.has_weapon_ini ? "true" : "false",
		g_archive_probe.has_particle_system_ini ? "true" : "false",
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
		damage_fx_probe_json.c_str(),
		fx_list_probe_json.c_str(),
		object_creation_list_probe_json.c_str(),
		weapon_probe_json.c_str(),
		ai_data_probe_json.c_str(),
		locomotor_probe_json.c_str(),
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
		command_set_probe_json.c_str(),
		control_bar_scheme_probe_json.c_str(),
		crate_probe_json.c_str(),
		draw_group_info_probe_json.c_str(),
		mapped_image_probe_json.c_str(),
		challenge_mode_probe_json.c_str(),
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
		game_text_language_json.c_str(),
		game_text_csf_path_json.c_str(),
		g_archive_probe.game_text_selected_csf_exists ? "true" : "false",
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
		browser_runtime_assets_json.c_str(),
		startup_assets_ready() ? "true" : "false",
		startup_asset_status_json.c_str(),
		startup_asset_message_json.c_str(),
		g_archive_mount.registered ? "true" : "false",
		g_archive_mount.boot_probe_attempted ? "true" : "false",
		g_archive_mount.boot_probe_ok ? "true" : "false",
		startup_boot_ini_present() ? "true" : "false",
		startup_armor_ready() ? "true" : "false",
		startup_damage_fx_ready() ? "true" : "false",
		startup_fx_list_ready() ? "true" : "false",
		startup_science_ready() ? "true" : "false",
		startup_object_creation_list_ready() ? "true" : "false",
		startup_weapon_ready() ? "true" : "false",
		g_archive_probe.has_particle_system_ini ? "true" : "false",
		startup_ai_data_ready() ? "true" : "false",
		startup_locomotor_ready() ? "true" : "false",
		startup_upgrade_ready() ? "true" : "false",
		startup_command_button_ready() ? "true" : "false",
		startup_command_set_ready() ? "true" : "false",
		startup_control_bar_scheme_ready() ? "true" : "false",
		startup_crate_ready() ? "true" : "false",
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
		data_summary_json.c_str(),
		original_engine_startup_json.c_str(),
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
		file_system_probe_json.c_str(),
		game_network_probe_json.c_str(),
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
	wasm_browser_runtime_assets_install_archive_set(
		g_archive_mount.directory.c_str(),
		g_archive_mount.file_mask.c_str());
	std::printf("cnc-port: archive set directory=%s mask=%s count=%d bytes=%.0f\n",
		g_archive_mount.directory.c_str(),
		g_archive_mount.file_mask.c_str(),
		g_archive_mount.archive_count,
		g_archive_mount.total_bytes);
	return write_state_json();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_set_browser_input(
	int cursor_x,
	int cursor_y,
	int cursor_available,
	int virtual_key,
	int key_down)
{
	if (cursor_available) {
		WasmWin32Input::SetCursorPosition(cursor_x, cursor_y);
	}
	if (virtual_key >= 0) {
		WasmWin32Input::SetKeyState(virtual_key, key_down != 0);
	}
	return write_state_json();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_reset_browser_input()
{
	WasmWin32Input::Reset();
	return write_state_json();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_post_browser_message(
	int message,
	int w_param,
	int l_param,
	int point_x,
	int point_y)
{
	POINT point = {point_x, point_y};
	WasmWin32Input::QueueMessage(
		ApplicationHWnd,
		static_cast<UINT>(message),
		static_cast<WPARAM>(static_cast<unsigned int>(w_param)),
		static_cast<LPARAM>(l_param),
		0,
		&point);
	return write_state_json();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_browser_message_queue()
{
	const unsigned int before_count = WasmWin32Input::message_queue_count;
	MSG peek_message = {};
	MSG removed_message = {};
	MSG after_message = {};
	const BOOL peek_ok = PeekMessage(&peek_message, nullptr, 0, 0, PM_NOREMOVE);
	const unsigned int after_peek_count = WasmWin32Input::message_queue_count;
	const BOOL remove_ok = PeekMessage(&removed_message, nullptr, 0, 0, PM_REMOVE);
	const unsigned int after_remove_count = WasmWin32Input::message_queue_count;
	const BOOL after_ok = PeekMessage(&after_message, nullptr, 0, 0, PM_NOREMOVE);
	const std::string peek_json = peek_ok ? build_win32_message_json(peek_message) : "null";
	const std::string removed_json = remove_ok ? build_win32_message_json(removed_message) : "null";
	const std::string after_json = after_ok ? build_win32_message_json(after_message) : "null";

	char buffer[1400];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"browser_win32_message_queue\","
		"\"beforeCount\":%u,\"afterPeekCount\":%u,\"afterRemoveCount\":%u,"
		"\"peek\":%s,\"removed\":%s,\"after\":%s,"
		"\"overflowed\":%s}",
		before_count,
		after_peek_count,
		after_remove_count,
		peek_json.c_str(),
		removed_json.c_str(),
		after_json.c_str(),
		WasmWin32Input::message_queue_overflowed ? "true" : "false");
	g_input_probe_json = buffer;
	return g_input_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_browser_input()
{
	POINT cursor = {0, 0};
	const BOOL cursor_ok = GetCursorPos(&cursor);
	ScreenToClient(nullptr, &cursor);
	const SHORT f6_first = GetAsyncKeyState(VK_F6);
	const SHORT f6_second = GetAsyncKeyState(VK_F6);
	const SHORT delete_state = GetAsyncKeyState(VK_DELETE);

	char buffer[700];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"browser_win32_input_shim\","
		"\"cursor\":{\"ok\":%s,\"x\":%ld,\"y\":%ld},"
		"\"f6\":{\"first\":%u,\"second\":%u},"
		"\"delete\":{\"state\":%u},"
		"\"raw\":%s}",
		cursor_ok ? "true" : "false",
		cursor.x,
		cursor.y,
		static_cast<unsigned int>(static_cast<unsigned short>(f6_first)),
		static_cast<unsigned int>(static_cast<unsigned short>(f6_second)),
		static_cast<unsigned int>(static_cast<unsigned short>(delete_state)),
		build_browser_input_json().c_str());
	g_input_probe_json = buffer;
	return g_input_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_d3d8_clear(std::uint32_t clear_color)
{
	wasm_d3d8_reset_state();

	IDirect3D8 *d3d = Direct3DCreate8(D3D_SDK_VERSION);
	IDirect3DDevice8 *device = nullptr;
	bool ok = d3d != nullptr;
	HRESULT create_result = E_FAIL;
	HRESULT begin_result = E_FAIL;
	HRESULT clear_result = E_FAIL;
	HRESULT end_result = E_FAIL;
	HRESULT present_result = E_FAIL;

	if (d3d != nullptr) {
		D3DPRESENT_PARAMETERS parameters = {};
		parameters.BackBufferWidth = 800;
		parameters.BackBufferHeight = 600;
		parameters.BackBufferFormat = D3DFMT_A8R8G8B8;
		parameters.BackBufferCount = 1;
		parameters.MultiSampleType = D3DMULTISAMPLE_NONE;
		parameters.SwapEffect = D3DSWAPEFFECT_DISCARD;
		parameters.Windowed = TRUE;
		parameters.EnableAutoDepthStencil = TRUE;
		parameters.AutoDepthStencilFormat = D3DFMT_D24S8;

		create_result = d3d->CreateDevice(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, nullptr,
			D3DCREATE_SOFTWARE_VERTEXPROCESSING, &parameters, &device);
		ok = ok && SUCCEEDED(create_result) && device != nullptr;
	}

	if (device != nullptr) {
		begin_result = device->BeginScene();
		clear_result = device->Clear(0, nullptr, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER,
			static_cast<D3DCOLOR>(clear_color), 1.0f, 0);
		end_result = device->EndScene();
		present_result = device->Present(nullptr, nullptr, nullptr, nullptr);
		ok = ok && SUCCEEDED(begin_result) && SUCCEEDED(clear_result) &&
			SUCCEEDED(end_result) && SUCCEEDED(present_result);
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	ok = ok &&
		state != nullptr &&
		state->direct3d_create_calls == 1 &&
		state->create_device_calls == 1 &&
		state->begin_scene_calls == 1 &&
		state->clear_calls == 1 &&
		state->end_scene_calls == 1 &&
		state->present_calls == 1 &&
		state->last_clear_color == static_cast<D3DCOLOR>(clear_color);

	if (device != nullptr) {
		device->Release();
	}
	if (d3d != nullptr) {
		d3d->Release();
	}

	const unsigned int red = (clear_color >> 16) & 0xff;
	const unsigned int green = (clear_color >> 8) & 0xff;
	const unsigned int blue = clear_color & 0xff;
	const unsigned int alpha = (clear_color >> 24) & 0xff;

	char buffer[900];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"browser_d3d8_clear_probe\","
		"\"ok\":%s,"
		"\"clearColor\":%lu,"
		"\"rgba\":[%u,%u,%u,%u],"
		"\"results\":{\"create\":%ld,\"begin\":%ld,\"clear\":%ld,\"end\":%ld,\"present\":%ld},"
		"\"calls\":{\"direct3DCreate\":%u,\"createDevice\":%u,\"beginScene\":%u,"
		"\"clear\":%u,\"endScene\":%u,\"present\":%u},"
		"\"lastClear\":{\"flags\":%lu,\"color\":%lu,\"z\":%.3f,\"stencil\":%lu}}",
		ok ? "true" : "false",
		static_cast<unsigned long>(clear_color),
		red,
		green,
		blue,
		alpha,
		static_cast<long>(create_result),
		static_cast<long>(begin_result),
		static_cast<long>(clear_result),
		static_cast<long>(end_result),
		static_cast<long>(present_result),
		state != nullptr ? state->direct3d_create_calls : 0,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->begin_scene_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->end_scene_calls : 0,
		state != nullptr ? state->present_calls : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_clear_flags : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_clear_color : 0),
		state != nullptr ? state->last_clear_z : 0.0f,
		static_cast<unsigned long>(state != nullptr ? state->last_clear_stencil : 0));
	g_d3d8_probe_json = buffer;
	return g_d3d8_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_d3d8_buffer_dirty()
{
	wasm_d3d8_reset_state();

	IDirect3D8 *d3d = Direct3DCreate8(D3D_SDK_VERSION);
	IDirect3DDevice8 *device = nullptr;
	IDirect3DVertexBuffer8 *vertex_buffer = nullptr;
	IDirect3DIndexBuffer8 *index_buffer = nullptr;
	bool ok = d3d != nullptr;
	HRESULT create_result = E_FAIL;
	HRESULT vertex_create_result = E_FAIL;
	HRESULT index_create_result = E_FAIL;
	HRESULT vertex_lock_result = E_FAIL;
	HRESULT vertex_unlock_result = E_FAIL;
	HRESULT index_lock_result = E_FAIL;
	HRESULT index_unlock_result = E_FAIL;

	if (d3d != nullptr) {
		D3DPRESENT_PARAMETERS parameters = {};
		parameters.BackBufferWidth = 800;
		parameters.BackBufferHeight = 600;
		parameters.BackBufferFormat = D3DFMT_A8R8G8B8;
		parameters.BackBufferCount = 1;
		parameters.MultiSampleType = D3DMULTISAMPLE_NONE;
		parameters.SwapEffect = D3DSWAPEFFECT_DISCARD;
		parameters.Windowed = TRUE;
		parameters.EnableAutoDepthStencil = TRUE;
		parameters.AutoDepthStencilFormat = D3DFMT_D24S8;

		create_result = d3d->CreateDevice(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, nullptr,
			D3DCREATE_SOFTWARE_VERTEXPROCESSING, &parameters, &device);
		ok = ok && SUCCEEDED(create_result) && device != nullptr;
	}

	const UINT vertex_offset = 24;
	const UINT vertex_bytes = 40;
	const UINT index_offset = 8;
	const UINT index_bytes = 20;
	UINT vertex_update_offset = 0;
	UINT vertex_update_bytes = 0;
	UINT index_update_offset = 0;
	UINT index_update_bytes = 0;

	if (device != nullptr) {
		vertex_create_result = device->CreateVertexBuffer(128, D3DUSAGE_WRITEONLY, 0,
			D3DPOOL_DEFAULT, &vertex_buffer);
		index_create_result = device->CreateIndexBuffer(96, D3DUSAGE_WRITEONLY, D3DFMT_INDEX16,
			D3DPOOL_DEFAULT, &index_buffer);
		ok = ok && SUCCEEDED(vertex_create_result) && vertex_buffer != nullptr &&
			SUCCEEDED(index_create_result) && index_buffer != nullptr;
	}

	if (vertex_buffer != nullptr) {
		BYTE *data = nullptr;
		vertex_lock_result = vertex_buffer->Lock(vertex_offset, vertex_bytes, &data, 0);
		if (SUCCEEDED(vertex_lock_result) && data != nullptr) {
			std::memset(data, 0x5a, vertex_bytes);
		}
		vertex_unlock_result = vertex_buffer->Unlock();
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		vertex_update_offset = state != nullptr ? state->last_browser_buffer_offset : 0;
		vertex_update_bytes = state != nullptr ? state->last_browser_buffer_bytes : 0;
		ok = ok && SUCCEEDED(vertex_lock_result) && SUCCEEDED(vertex_unlock_result) &&
			vertex_update_offset == vertex_offset && vertex_update_bytes == vertex_bytes;
	}

	if (index_buffer != nullptr) {
		BYTE *data = nullptr;
		index_lock_result = index_buffer->Lock(index_offset, index_bytes, &data, 0);
		if (SUCCEEDED(index_lock_result) && data != nullptr) {
			std::memset(data, 0xa5, index_bytes);
		}
		index_unlock_result = index_buffer->Unlock();
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		index_update_offset = state != nullptr ? state->last_browser_buffer_offset : 0;
		index_update_bytes = state != nullptr ? state->last_browser_buffer_bytes : 0;
		ok = ok && SUCCEEDED(index_lock_result) && SUCCEEDED(index_unlock_result) &&
			index_update_offset == index_offset && index_update_bytes == index_bytes;
	}

	if (index_buffer != nullptr) {
		index_buffer->Release();
	}
	if (vertex_buffer != nullptr) {
		vertex_buffer->Release();
	}
	if (device != nullptr) {
		device->Release();
	}
	if (d3d != nullptr) {
		d3d->Release();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	ok = ok &&
		state != nullptr &&
		state->direct3d_create_calls == 1 &&
		state->create_device_calls == 1 &&
		state->create_vertex_buffer_calls == 1 &&
		state->create_index_buffer_calls == 1 &&
		state->buffer_lock_calls == 2 &&
		state->buffer_unlock_calls == 2 &&
		state->browser_buffer_create_calls == 2 &&
		state->browser_buffer_update_calls == 2 &&
		state->browser_buffer_release_calls == 2;

	char buffer[1200];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"browser_d3d8_buffer_dirty_probe\","
		"\"ok\":%s,"
		"\"results\":{\"create\":%ld,\"vertexCreate\":%ld,\"indexCreate\":%ld,"
		"\"vertexLock\":%ld,\"vertexUnlock\":%ld,\"indexLock\":%ld,\"indexUnlock\":%ld},"
		"\"calls\":{\"direct3DCreate\":%u,\"createDevice\":%u,\"createVertexBuffer\":%u,"
		"\"createIndexBuffer\":%u,\"bufferLock\":%u,\"bufferUnlock\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,\"browserBufferRelease\":%u},"
		"\"vertexUpdate\":{\"offset\":%u,\"bytes\":%u},"
		"\"indexUpdate\":{\"offset\":%u,\"bytes\":%u}}",
		ok ? "true" : "false",
		static_cast<long>(create_result),
		static_cast<long>(vertex_create_result),
		static_cast<long>(index_create_result),
		static_cast<long>(vertex_lock_result),
		static_cast<long>(vertex_unlock_result),
		static_cast<long>(index_lock_result),
		static_cast<long>(index_unlock_result),
		state != nullptr ? state->direct3d_create_calls : 0,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_vertex_buffer_calls : 0,
		state != nullptr ? state->create_index_buffer_calls : 0,
		state != nullptr ? state->buffer_lock_calls : 0,
		state != nullptr ? state->buffer_unlock_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		vertex_update_offset,
		vertex_update_bytes,
		index_update_offset,
		index_update_bytes);
	g_d3d8_probe_json = buffer;
	return g_d3d8_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_d3d8_buffer_hints()
{
	wasm_d3d8_reset_state();

	IDirect3D8 *d3d = Direct3DCreate8(D3D_SDK_VERSION);
	IDirect3DDevice8 *device = nullptr;
	IDirect3DVertexBuffer8 *static_vertex_buffer = nullptr;
	IDirect3DIndexBuffer8 *dynamic_index_buffer = nullptr;
	bool ok = d3d != nullptr;
	HRESULT create_result = E_FAIL;
	HRESULT static_create_result = E_FAIL;
	HRESULT static_lock_result = E_FAIL;
	HRESULT static_unlock_result = E_FAIL;
	HRESULT dynamic_create_result = E_FAIL;
	HRESULT dynamic_lock_result = E_FAIL;
	HRESULT dynamic_unlock_result = E_FAIL;

	if (d3d != nullptr) {
		D3DPRESENT_PARAMETERS parameters = {};
		parameters.BackBufferWidth = 800;
		parameters.BackBufferHeight = 600;
		parameters.BackBufferFormat = D3DFMT_A8R8G8B8;
		parameters.BackBufferCount = 1;
		parameters.MultiSampleType = D3DMULTISAMPLE_NONE;
		parameters.SwapEffect = D3DSWAPEFFECT_DISCARD;
		parameters.Windowed = TRUE;
		parameters.EnableAutoDepthStencil = TRUE;
		parameters.AutoDepthStencilFormat = D3DFMT_D24S8;

		create_result = d3d->CreateDevice(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, nullptr,
			D3DCREATE_SOFTWARE_VERTEXPROCESSING, &parameters, &device);
		ok = ok && SUCCEEDED(create_result) && device != nullptr;
	}

	const DWORD static_usage = D3DUSAGE_WRITEONLY;
	const DWORD dynamic_usage = D3DUSAGE_WRITEONLY | D3DUSAGE_DYNAMIC;
	const DWORD dynamic_lock_flags = D3DLOCK_DISCARD | D3DLOCK_NOSYSLOCK;
	DWORD static_create_usage = 0;
	DWORD static_update_usage = 0;
	DWORD static_update_flags = 0;
	DWORD dynamic_create_usage = 0;
	DWORD dynamic_update_usage = 0;
	DWORD dynamic_update_flags = 0;
	UINT dynamic_update_offset = 0;
	UINT dynamic_update_bytes = 0;

	if (device != nullptr) {
		static_create_result = device->CreateVertexBuffer(64, static_usage, 0,
			D3DPOOL_DEFAULT, &static_vertex_buffer);
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		static_create_usage = state != nullptr ? state->last_browser_buffer_usage : 0;
		ok = ok && SUCCEEDED(static_create_result) && static_vertex_buffer != nullptr &&
			static_create_usage == static_usage;
	}

	if (static_vertex_buffer != nullptr) {
		BYTE *data = nullptr;
		static_lock_result = static_vertex_buffer->Lock(8, 16, &data, 0);
		if (SUCCEEDED(static_lock_result) && data != nullptr) {
			std::memset(data, 0x3c, 16);
		}
		static_unlock_result = static_vertex_buffer->Unlock();
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		static_update_usage = state != nullptr ? state->last_browser_buffer_usage : 0;
		static_update_flags = state != nullptr ? state->last_browser_buffer_lock_flags : 0;
		ok = ok && SUCCEEDED(static_lock_result) && SUCCEEDED(static_unlock_result) &&
			static_update_usage == static_usage && static_update_flags == 0;
	}

	if (device != nullptr) {
		dynamic_create_result = device->CreateIndexBuffer(96, dynamic_usage, D3DFMT_INDEX16,
			D3DPOOL_DEFAULT, &dynamic_index_buffer);
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		dynamic_create_usage = state != nullptr ? state->last_browser_buffer_usage : 0;
		ok = ok && SUCCEEDED(dynamic_create_result) && dynamic_index_buffer != nullptr &&
			dynamic_create_usage == dynamic_usage;
	}

	if (dynamic_index_buffer != nullptr) {
		BYTE *data = nullptr;
		dynamic_lock_result = dynamic_index_buffer->Lock(0, 32, &data, dynamic_lock_flags);
		if (SUCCEEDED(dynamic_lock_result) && data != nullptr) {
			std::memset(data, 0x7d, 32);
		}
		dynamic_unlock_result = dynamic_index_buffer->Unlock();
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		dynamic_update_usage = state != nullptr ? state->last_browser_buffer_usage : 0;
		dynamic_update_flags = state != nullptr ? state->last_browser_buffer_lock_flags : 0;
		dynamic_update_offset = state != nullptr ? state->last_browser_buffer_offset : 0;
		dynamic_update_bytes = state != nullptr ? state->last_browser_buffer_bytes : 0;
		ok = ok && SUCCEEDED(dynamic_lock_result) && SUCCEEDED(dynamic_unlock_result) &&
			dynamic_update_usage == dynamic_usage && dynamic_update_flags == dynamic_lock_flags &&
			dynamic_update_offset == 0 && dynamic_update_bytes == 32;
	}

	if (dynamic_index_buffer != nullptr) {
		dynamic_index_buffer->Release();
	}
	if (static_vertex_buffer != nullptr) {
		static_vertex_buffer->Release();
	}
	if (device != nullptr) {
		device->Release();
	}
	if (d3d != nullptr) {
		d3d->Release();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	ok = ok &&
		state != nullptr &&
		state->direct3d_create_calls == 1 &&
		state->create_device_calls == 1 &&
		state->create_vertex_buffer_calls == 1 &&
		state->create_index_buffer_calls == 1 &&
		state->buffer_lock_calls == 2 &&
		state->buffer_unlock_calls == 2 &&
		state->browser_buffer_create_calls == 2 &&
		state->browser_buffer_update_calls == 2 &&
		state->browser_buffer_release_calls == 2;

	char buffer[1600];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"browser_d3d8_buffer_hints_probe\","
		"\"ok\":%s,"
		"\"results\":{\"create\":%ld,\"staticCreate\":%ld,\"staticLock\":%ld,"
		"\"staticUnlock\":%ld,\"dynamicCreate\":%ld,\"dynamicLock\":%ld,\"dynamicUnlock\":%ld},"
		"\"calls\":{\"direct3DCreate\":%u,\"createDevice\":%u,\"createVertexBuffer\":%u,"
		"\"createIndexBuffer\":%u,\"bufferLock\":%u,\"bufferUnlock\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,\"browserBufferRelease\":%u},"
		"\"staticUpdate\":{\"createUsage\":%lu,\"usage\":%lu,\"lockFlags\":%lu},"
		"\"dynamicUpdate\":{\"createUsage\":%lu,\"usage\":%lu,\"lockFlags\":%lu,"
		"\"offset\":%u,\"bytes\":%u}}",
		ok ? "true" : "false",
		static_cast<long>(create_result),
		static_cast<long>(static_create_result),
		static_cast<long>(static_lock_result),
		static_cast<long>(static_unlock_result),
		static_cast<long>(dynamic_create_result),
		static_cast<long>(dynamic_lock_result),
		static_cast<long>(dynamic_unlock_result),
		state != nullptr ? state->direct3d_create_calls : 0,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_vertex_buffer_calls : 0,
		state != nullptr ? state->create_index_buffer_calls : 0,
		state != nullptr ? state->buffer_lock_calls : 0,
		state != nullptr ? state->buffer_unlock_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		static_cast<unsigned long>(static_create_usage),
		static_cast<unsigned long>(static_update_usage),
		static_cast<unsigned long>(static_update_flags),
		static_cast<unsigned long>(dynamic_create_usage),
		static_cast<unsigned long>(dynamic_update_usage),
		static_cast<unsigned long>(dynamic_update_flags),
		dynamic_update_offset,
		dynamic_update_bytes);
	g_d3d8_probe_json = buffer;
	return g_d3d8_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_d3d8_texture_upload()
{
	wasm_d3d8_reset_state();

	IDirect3D8 *d3d = Direct3DCreate8(D3D_SDK_VERSION);
	IDirect3DDevice8 *device = nullptr;
	IDirect3DTexture8 *argb_texture = nullptr;
	IDirect3DTexture8 *xrgb_texture = nullptr;
	bool ok = d3d != nullptr;
	HRESULT create_result = E_FAIL;
	HRESULT argb_create_result = E_FAIL;
	HRESULT argb_lock_result = E_FAIL;
	HRESULT argb_unlock_result = E_FAIL;
	HRESULT subrect_lock_result = E_FAIL;
	HRESULT subrect_unlock_result = E_FAIL;
	HRESULT xrgb_create_result = E_FAIL;
	HRESULT xrgb_lock_result = E_FAIL;
	HRESULT xrgb_unlock_result = E_FAIL;

	if (d3d != nullptr) {
		D3DPRESENT_PARAMETERS parameters = {};
		parameters.BackBufferWidth = 800;
		parameters.BackBufferHeight = 600;
		parameters.BackBufferFormat = D3DFMT_A8R8G8B8;
		parameters.BackBufferCount = 1;
		parameters.MultiSampleType = D3DMULTISAMPLE_NONE;
		parameters.SwapEffect = D3DSWAPEFFECT_DISCARD;
		parameters.Windowed = TRUE;
		parameters.EnableAutoDepthStencil = TRUE;
		parameters.AutoDepthStencilFormat = D3DFMT_D24S8;

		create_result = d3d->CreateDevice(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, nullptr,
			D3DCREATE_SOFTWARE_VERTEXPROCESSING, &parameters, &device);
		ok = ok && SUCCEEDED(create_result) && device != nullptr;
	}

	UINT argb_texture_id = 0;
	UINT argb_update_width = 0;
	UINT argb_update_height = 0;
	UINT argb_update_pitch = 0;
	UINT argb_update_row_bytes = 0;
	DWORD argb_update_checksum = 0;
	UINT subrect_x = 0;
	UINT subrect_y = 0;
	UINT subrect_width = 0;
	UINT subrect_height = 0;
	UINT subrect_pitch = 0;
	UINT subrect_row_bytes = 0;
	DWORD subrect_checksum = 0;
	UINT xrgb_texture_id = 0;
	UINT xrgb_update_width = 0;
	UINT xrgb_update_height = 0;
	DWORD xrgb_update_checksum = 0;

	if (device != nullptr) {
		argb_create_result = device->CreateTexture(4, 4, 2, 0,
			D3DFMT_A8R8G8B8, D3DPOOL_MANAGED, &argb_texture);
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		argb_texture_id = state != nullptr ? state->last_browser_texture_id : 0;
		ok = ok && SUCCEEDED(argb_create_result) && argb_texture != nullptr && argb_texture_id != 0;
	}

	if (argb_texture != nullptr) {
		D3DLOCKED_RECT locked_rect = {};
		argb_lock_result = argb_texture->LockRect(0, &locked_rect, nullptr, 0);
		if (SUCCEEDED(argb_lock_result) && locked_rect.pBits != nullptr) {
			std::memset(locked_rect.pBits, 0, static_cast<std::size_t>(locked_rect.Pitch) * 4);
			BYTE *pixel = static_cast<BYTE *>(locked_rect.pBits);
			pixel[0] = 0x22; // B
			pixel[1] = 0x44; // G
			pixel[2] = 0x66; // R
			pixel[3] = 0x88; // A
		}
		argb_unlock_result = argb_texture->UnlockRect(0);
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		argb_update_width = state != nullptr ? state->last_browser_texture_width : 0;
		argb_update_height = state != nullptr ? state->last_browser_texture_height : 0;
		argb_update_pitch = state != nullptr ? state->last_browser_texture_pitch : 0;
		argb_update_row_bytes = state != nullptr ? state->last_browser_texture_row_bytes : 0;
		argb_update_checksum = state != nullptr ? state->last_browser_texture_checksum : 0;
		ok = ok && SUCCEEDED(argb_lock_result) && SUCCEEDED(argb_unlock_result) &&
			argb_update_width == 4 && argb_update_height == 4 &&
			argb_update_pitch == 16 && argb_update_row_bytes == 16;
	}

	if (argb_texture != nullptr) {
		RECT sub_rect = {};
		sub_rect.left = 1;
		sub_rect.top = 2;
		sub_rect.right = 2;
		sub_rect.bottom = 3;
		D3DLOCKED_RECT locked_rect = {};
		subrect_lock_result = argb_texture->LockRect(0, &locked_rect, &sub_rect, 0);
		if (SUCCEEDED(subrect_lock_result) && locked_rect.pBits != nullptr) {
			BYTE *pixel = static_cast<BYTE *>(locked_rect.pBits);
			pixel[0] = 0x10; // B
			pixel[1] = 0x20; // G
			pixel[2] = 0x30; // R
			pixel[3] = 0x40; // A
		}
		subrect_unlock_result = argb_texture->UnlockRect(0);
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		subrect_x = state != nullptr ? state->last_browser_texture_x : 0;
		subrect_y = state != nullptr ? state->last_browser_texture_y : 0;
		subrect_width = state != nullptr ? state->last_browser_texture_width : 0;
		subrect_height = state != nullptr ? state->last_browser_texture_height : 0;
		subrect_pitch = state != nullptr ? state->last_browser_texture_pitch : 0;
		subrect_row_bytes = state != nullptr ? state->last_browser_texture_row_bytes : 0;
		subrect_checksum = state != nullptr ? state->last_browser_texture_checksum : 0;
		ok = ok && SUCCEEDED(subrect_lock_result) && SUCCEEDED(subrect_unlock_result) &&
			subrect_x == 1 && subrect_y == 2 && subrect_width == 1 && subrect_height == 1 &&
			subrect_pitch == 16 && subrect_row_bytes == 4;
	}

	if (device != nullptr) {
		xrgb_create_result = device->CreateTexture(2, 2, 1, 0,
			D3DFMT_X8R8G8B8, D3DPOOL_MANAGED, &xrgb_texture);
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		xrgb_texture_id = state != nullptr ? state->last_browser_texture_id : 0;
		ok = ok && SUCCEEDED(xrgb_create_result) && xrgb_texture != nullptr && xrgb_texture_id != 0;
	}

	if (xrgb_texture != nullptr) {
		D3DLOCKED_RECT locked_rect = {};
		xrgb_lock_result = xrgb_texture->LockRect(0, &locked_rect, nullptr, 0);
		if (SUCCEEDED(xrgb_lock_result) && locked_rect.pBits != nullptr) {
			std::memset(locked_rect.pBits, 0, static_cast<std::size_t>(locked_rect.Pitch) * 2);
			BYTE *pixel = static_cast<BYTE *>(locked_rect.pBits);
			pixel[0] = 0x05; // B
			pixel[1] = 0x06; // G
			pixel[2] = 0x07; // R
			pixel[3] = 0x00; // X, browser upload must force alpha opaque
		}
		xrgb_unlock_result = xrgb_texture->UnlockRect(0);
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		xrgb_update_width = state != nullptr ? state->last_browser_texture_width : 0;
		xrgb_update_height = state != nullptr ? state->last_browser_texture_height : 0;
		xrgb_update_checksum = state != nullptr ? state->last_browser_texture_checksum : 0;
		ok = ok && SUCCEEDED(xrgb_lock_result) && SUCCEEDED(xrgb_unlock_result) &&
			xrgb_update_width == 2 && xrgb_update_height == 2;
	}

	if (xrgb_texture != nullptr) {
		xrgb_texture->Release();
	}
	if (argb_texture != nullptr) {
		argb_texture->Release();
	}
	if (device != nullptr) {
		device->Release();
	}
	if (d3d != nullptr) {
		d3d->Release();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	ok = ok &&
		state != nullptr &&
		state->direct3d_create_calls == 1 &&
		state->create_device_calls == 1 &&
		state->create_texture_calls == 2 &&
		state->texture_lock_rect_calls == 3 &&
		state->texture_unlock_rect_calls == 3 &&
		state->browser_texture_create_calls == 2 &&
		state->browser_texture_update_calls == 3 &&
		state->browser_texture_release_calls == 2;

	char buffer[1900];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"browser_d3d8_texture_upload_probe\","
		"\"ok\":%s,"
		"\"results\":{\"create\":%ld,\"argbCreate\":%ld,\"argbLock\":%ld,"
		"\"argbUnlock\":%ld,\"subrectLock\":%ld,\"subrectUnlock\":%ld,"
		"\"xrgbCreate\":%ld,\"xrgbLock\":%ld,\"xrgbUnlock\":%ld},"
		"\"calls\":{\"direct3DCreate\":%u,\"createDevice\":%u,\"createTexture\":%u,"
		"\"textureLockRect\":%u,\"textureUnlockRect\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,\"browserTextureRelease\":%u},"
		"\"argbUpdate\":{\"textureId\":%u,\"width\":%u,\"height\":%u,"
		"\"pitch\":%u,\"rowBytes\":%u,\"checksum\":%lu,"
		"\"expectedSample\":[102,68,34,136]},"
		"\"subrectUpdate\":{\"x\":%u,\"y\":%u,\"width\":%u,\"height\":%u,"
		"\"pitch\":%u,\"rowBytes\":%u,\"checksum\":%lu,"
		"\"expectedSample\":[48,32,16,64]},"
		"\"xrgbUpdate\":{\"textureId\":%u,\"width\":%u,\"height\":%u,"
		"\"checksum\":%lu,\"expectedSample\":[7,6,5,255]}}",
		ok ? "true" : "false",
		static_cast<long>(create_result),
		static_cast<long>(argb_create_result),
		static_cast<long>(argb_lock_result),
		static_cast<long>(argb_unlock_result),
		static_cast<long>(subrect_lock_result),
		static_cast<long>(subrect_unlock_result),
		static_cast<long>(xrgb_create_result),
		static_cast<long>(xrgb_lock_result),
		static_cast<long>(xrgb_unlock_result),
		state != nullptr ? state->direct3d_create_calls : 0,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->texture_lock_rect_calls : 0,
		state != nullptr ? state->texture_unlock_rect_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		argb_texture_id,
		argb_update_width,
		argb_update_height,
		argb_update_pitch,
		argb_update_row_bytes,
		static_cast<unsigned long>(argb_update_checksum),
		subrect_x,
		subrect_y,
		subrect_width,
		subrect_height,
		subrect_pitch,
		subrect_row_bytes,
		static_cast<unsigned long>(subrect_checksum),
		xrgb_texture_id,
		xrgb_update_width,
		xrgb_update_height,
		static_cast<unsigned long>(xrgb_update_checksum));
	g_d3d8_probe_json = buffer;
	return g_d3d8_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_d3d8_volume_texture_upload()
{
	wasm_d3d8_reset_state();

	IDirect3D8 *d3d = Direct3DCreate8(D3D_SDK_VERSION);
	IDirect3DDevice8 *device = nullptr;
	IDirect3DVolumeTexture8 *texture = nullptr;
	IDirect3DVolume8 *volume = nullptr;
	bool ok = d3d != nullptr;
	HRESULT create_result = E_FAIL;
	HRESULT volume_create_result = E_FAIL;
	HRESULT level0_desc_result = E_FAIL;
	HRESULT level1_desc_result = E_FAIL;
	HRESULT volume_level_result = E_FAIL;
	HRESULT volume_desc_result = E_FAIL;
	HRESULT full_lock_result = E_FAIL;
	HRESULT full_unlock_result = E_FAIL;
	HRESULT subbox_lock_result = E_FAIL;
	HRESULT subbox_unlock_result = E_FAIL;
	HRESULT level1_lock_result = E_FAIL;
	HRESULT level1_unlock_result = E_FAIL;
	HRESULT bind_result = E_FAIL;
	HRESULT null_bind_result = E_FAIL;

	if (d3d != nullptr) {
		D3DPRESENT_PARAMETERS parameters = {};
		parameters.BackBufferWidth = 320;
		parameters.BackBufferHeight = 240;
		parameters.BackBufferFormat = D3DFMT_A8R8G8B8;
		parameters.BackBufferCount = 1;
		parameters.MultiSampleType = D3DMULTISAMPLE_NONE;
		parameters.SwapEffect = D3DSWAPEFFECT_DISCARD;
		parameters.Windowed = TRUE;
		parameters.EnableAutoDepthStencil = TRUE;
		parameters.AutoDepthStencilFormat = D3DFMT_D24S8;

		create_result = d3d->CreateDevice(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, nullptr,
			D3DCREATE_SOFTWARE_VERTEXPROCESSING, &parameters, &device);
		ok = ok && SUCCEEDED(create_result) && device != nullptr;
	}

	UINT texture_id = 0;
	UINT create_depth = 0;
	if (device != nullptr) {
		volume_create_result = D3DXCreateVolumeTexture(device, 4, 4, 4, 2, 0,
			D3DFMT_A8R8G8B8, D3DPOOL_MANAGED, &texture);
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		texture_id = state != nullptr ? state->last_browser_texture_id : 0;
		create_depth = state != nullptr ? state->last_browser_texture_depth : 0;
		ok = ok && SUCCEEDED(volume_create_result) && texture != nullptr &&
			texture_id != 0 && create_depth == 4;
	}

	DWORD level_count = texture != nullptr ? texture->GetLevelCount() : 0;
	DWORD previous_lod = 0;
	DWORD current_lod = 0;
	D3DVOLUME_DESC level0_desc = {};
	D3DVOLUME_DESC level1_desc = {};
	D3DVOLUME_DESC volume_desc = {};
	if (texture != nullptr) {
		previous_lod = texture->SetLOD(1);
		current_lod = texture->GetLOD();
		texture->SetLOD(0);
		level0_desc_result = texture->GetLevelDesc(0, &level0_desc);
		level1_desc_result = texture->GetLevelDesc(1, &level1_desc);
		volume_level_result = texture->GetVolumeLevel(0, &volume);
		if (volume != nullptr) {
			volume_desc_result = volume->GetDesc(&volume_desc);
		}
		ok = ok && level_count == 2 && previous_lod == 0 && current_lod == 1 &&
			SUCCEEDED(level0_desc_result) && SUCCEEDED(level1_desc_result) &&
			SUCCEEDED(volume_level_result) && SUCCEEDED(volume_desc_result) &&
			level0_desc.Width == 4 && level0_desc.Height == 4 && level0_desc.Depth == 4 &&
			level1_desc.Width == 2 && level1_desc.Height == 2 && level1_desc.Depth == 2 &&
			volume_desc.Type == D3DRTYPE_VOLUME;
	}

	auto write_pixel = [](BYTE *pixel, BYTE blue, BYTE green, BYTE red, BYTE alpha) {
		pixel[0] = blue;
		pixel[1] = green;
		pixel[2] = red;
		pixel[3] = alpha;
	};

	UINT full_row_pitch = 0;
	UINT full_slice_pitch = 0;
	UINT full_width = 0;
	UINT full_height = 0;
	UINT full_depth = 0;
	UINT full_row_bytes = 0;
	DWORD full_checksum = 0;
	if (texture != nullptr) {
		D3DLOCKED_BOX locked_box = {};
		full_lock_result = texture->LockBox(0, &locked_box, nullptr, 0);
		if (SUCCEEDED(full_lock_result) && locked_box.pBits != nullptr) {
			std::memset(locked_box.pBits, 0, static_cast<std::size_t>(locked_box.SlicePitch) * 4);
			write_pixel(static_cast<BYTE *>(locked_box.pBits), 0x22, 0x44, 0x66, 0x88);
		}
		full_unlock_result = texture->UnlockBox(0);
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		full_row_pitch = state != nullptr ? state->last_browser_texture_pitch : 0;
		full_slice_pitch = state != nullptr ? state->last_browser_texture_slice_pitch : 0;
		full_width = state != nullptr ? state->last_browser_texture_width : 0;
		full_height = state != nullptr ? state->last_browser_texture_height : 0;
		full_depth = state != nullptr ? state->last_browser_texture_depth : 0;
		full_row_bytes = state != nullptr ? state->last_browser_texture_row_bytes : 0;
		full_checksum = state != nullptr ? state->last_browser_texture_checksum : 0;
		ok = ok && SUCCEEDED(full_lock_result) && SUCCEEDED(full_unlock_result) &&
			full_width == 4 && full_height == 4 && full_depth == 4 &&
			full_row_pitch == 16 && full_slice_pitch == 64 && full_row_bytes == 16;
	}

	UINT subbox_x = 0;
	UINT subbox_y = 0;
	UINT subbox_z = 0;
	UINT subbox_width = 0;
	UINT subbox_height = 0;
	UINT subbox_depth = 0;
	UINT subbox_row_pitch = 0;
	UINT subbox_slice_pitch = 0;
	UINT subbox_row_bytes = 0;
	DWORD subbox_checksum = 0;
	if (texture != nullptr) {
		D3DBOX box = {};
		box.Left = 1;
		box.Top = 1;
		box.Right = 2;
		box.Bottom = 3;
		box.Front = 1;
		box.Back = 3;
		D3DLOCKED_BOX locked_box = {};
		subbox_lock_result = texture->LockBox(0, &locked_box, &box, 0);
		if (SUCCEEDED(subbox_lock_result) && locked_box.pBits != nullptr) {
			BYTE *base = static_cast<BYTE *>(locked_box.pBits);
			write_pixel(base, 0x10, 0x20, 0x30, 0x40);
			write_pixel(base + locked_box.RowPitch, 0x11, 0x21, 0x31, 0x41);
			write_pixel(base + locked_box.SlicePitch, 0x12, 0x22, 0x32, 0x42);
			write_pixel(base + locked_box.SlicePitch + locked_box.RowPitch, 0x13, 0x23, 0x33, 0x43);
		}
		subbox_unlock_result = texture->UnlockBox(0);
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		subbox_x = state != nullptr ? state->last_browser_texture_x : 0;
		subbox_y = state != nullptr ? state->last_browser_texture_y : 0;
		subbox_z = state != nullptr ? state->last_browser_texture_z : 0;
		subbox_width = state != nullptr ? state->last_browser_texture_width : 0;
		subbox_height = state != nullptr ? state->last_browser_texture_height : 0;
		subbox_depth = state != nullptr ? state->last_browser_texture_depth : 0;
		subbox_row_pitch = state != nullptr ? state->last_browser_texture_pitch : 0;
		subbox_slice_pitch = state != nullptr ? state->last_browser_texture_slice_pitch : 0;
		subbox_row_bytes = state != nullptr ? state->last_browser_texture_row_bytes : 0;
		subbox_checksum = state != nullptr ? state->last_browser_texture_checksum : 0;
		ok = ok && SUCCEEDED(subbox_lock_result) && SUCCEEDED(subbox_unlock_result) &&
			subbox_x == 1 && subbox_y == 1 && subbox_z == 1 &&
			subbox_width == 1 && subbox_height == 2 && subbox_depth == 2 &&
			subbox_row_pitch == 16 && subbox_slice_pitch == 64 && subbox_row_bytes == 4;
	}

	UINT level1_row_pitch = 0;
	UINT level1_slice_pitch = 0;
	UINT level1_width = 0;
	UINT level1_height = 0;
	UINT level1_depth = 0;
	UINT level1_row_bytes = 0;
	DWORD level1_checksum = 0;
	if (texture != nullptr) {
		D3DLOCKED_BOX locked_box = {};
		level1_lock_result = texture->LockBox(1, &locked_box, nullptr, 0);
		if (SUCCEEDED(level1_lock_result) && locked_box.pBits != nullptr) {
			std::memset(locked_box.pBits, 0, static_cast<std::size_t>(locked_box.SlicePitch) * 2);
			write_pixel(static_cast<BYTE *>(locked_box.pBits), 0x05, 0x06, 0x07, 0xff);
		}
		level1_unlock_result = texture->UnlockBox(1);
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		level1_row_pitch = state != nullptr ? state->last_browser_texture_pitch : 0;
		level1_slice_pitch = state != nullptr ? state->last_browser_texture_slice_pitch : 0;
		level1_width = state != nullptr ? state->last_browser_texture_width : 0;
		level1_height = state != nullptr ? state->last_browser_texture_height : 0;
		level1_depth = state != nullptr ? state->last_browser_texture_depth : 0;
		level1_row_bytes = state != nullptr ? state->last_browser_texture_row_bytes : 0;
		level1_checksum = state != nullptr ? state->last_browser_texture_checksum : 0;
		ok = ok && SUCCEEDED(level1_lock_result) && SUCCEEDED(level1_unlock_result) &&
			level1_width == 2 && level1_height == 2 && level1_depth == 2 &&
			level1_row_pitch == 8 && level1_slice_pitch == 16 && level1_row_bytes == 8;
	}

	if (device != nullptr && texture != nullptr) {
		bind_result = device->SetTexture(2, texture);
		null_bind_result = device->SetTexture(2, nullptr);
		ok = ok && SUCCEEDED(bind_result) && SUCCEEDED(null_bind_result);
	}

	if (volume != nullptr) {
		volume->Release();
	}
	if (texture != nullptr) {
		texture->Release();
	}
	if (device != nullptr) {
		device->Release();
	}
	if (d3d != nullptr) {
		d3d->Release();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	ok = ok &&
		state != nullptr &&
		state->direct3d_create_calls == 1 &&
		state->create_device_calls == 1 &&
		state->create_volume_texture_calls == 1 &&
		state->texture_lock_box_calls == 3 &&
		state->texture_unlock_box_calls == 3 &&
		state->browser_texture_create_calls == 1 &&
		state->browser_texture_update_calls == 3 &&
		state->browser_texture_release_calls == 1 &&
		state->set_texture_calls == 2 &&
		state->browser_texture_bind_calls == 2;

	char buffer[3400];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"browser_d3d8_volume_texture_upload_probe\","
		"\"ok\":%s,"
		"\"results\":{\"create\":%ld,\"volumeCreate\":%ld,"
		"\"level0Desc\":%ld,\"level1Desc\":%ld,\"volumeLevel\":%ld,\"volumeDesc\":%ld,"
		"\"fullLock\":%ld,\"fullUnlock\":%ld,\"subboxLock\":%ld,\"subboxUnlock\":%ld,"
		"\"level1Lock\":%ld,\"level1Unlock\":%ld,\"bind\":%ld,\"nullBind\":%ld},"
		"\"calls\":{\"direct3DCreate\":%u,\"createDevice\":%u,\"createVolumeTexture\":%u,"
		"\"textureLockBox\":%u,\"textureUnlockBox\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,\"browserTextureRelease\":%u,"
		"\"setTexture\":%u,\"browserTextureBind\":%u},"
		"\"texture\":{\"id\":%u,\"levels\":%lu,\"previousLod\":%lu,\"currentLod\":%lu,"
		"\"level0\":{\"width\":%u,\"height\":%u,\"depth\":%u,\"size\":%u},"
		"\"level1\":{\"width\":%u,\"height\":%u,\"depth\":%u,\"size\":%u},"
		"\"volume\":{\"type\":%u,\"width\":%u,\"height\":%u,\"depth\":%u}},"
		"\"fullUpdate\":{\"width\":%u,\"height\":%u,\"depth\":%u,"
		"\"rowPitch\":%u,\"slicePitch\":%u,\"rowBytes\":%u,\"checksum\":%lu},"
		"\"subboxUpdate\":{\"x\":%u,\"y\":%u,\"z\":%u,\"width\":%u,\"height\":%u,\"depth\":%u,"
		"\"rowPitch\":%u,\"slicePitch\":%u,\"rowBytes\":%u,\"checksum\":%lu},"
		"\"level1Update\":{\"width\":%u,\"height\":%u,\"depth\":%u,"
		"\"rowPitch\":%u,\"slicePitch\":%u,\"rowBytes\":%u,\"checksum\":%lu}}",
		ok ? "true" : "false",
		static_cast<long>(create_result),
		static_cast<long>(volume_create_result),
		static_cast<long>(level0_desc_result),
		static_cast<long>(level1_desc_result),
		static_cast<long>(volume_level_result),
		static_cast<long>(volume_desc_result),
		static_cast<long>(full_lock_result),
		static_cast<long>(full_unlock_result),
		static_cast<long>(subbox_lock_result),
		static_cast<long>(subbox_unlock_result),
		static_cast<long>(level1_lock_result),
		static_cast<long>(level1_unlock_result),
		static_cast<long>(bind_result),
		static_cast<long>(null_bind_result),
		state != nullptr ? state->direct3d_create_calls : 0,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_volume_texture_calls : 0,
		state != nullptr ? state->texture_lock_box_calls : 0,
		state != nullptr ? state->texture_unlock_box_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		texture_id,
		static_cast<unsigned long>(level_count),
		static_cast<unsigned long>(previous_lod),
		static_cast<unsigned long>(current_lod),
		level0_desc.Width,
		level0_desc.Height,
		level0_desc.Depth,
		level0_desc.Size,
		level1_desc.Width,
		level1_desc.Height,
		level1_desc.Depth,
		level1_desc.Size,
		static_cast<unsigned int>(volume_desc.Type),
		volume_desc.Width,
		volume_desc.Height,
		volume_desc.Depth,
		full_width,
		full_height,
		full_depth,
		full_row_pitch,
		full_slice_pitch,
		full_row_bytes,
		static_cast<unsigned long>(full_checksum),
		subbox_x,
		subbox_y,
		subbox_z,
		subbox_width,
		subbox_height,
		subbox_depth,
		subbox_row_pitch,
		subbox_slice_pitch,
		subbox_row_bytes,
		static_cast<unsigned long>(subbox_checksum),
		level1_width,
		level1_height,
		level1_depth,
		level1_row_pitch,
		level1_slice_pitch,
		level1_row_bytes,
		static_cast<unsigned long>(level1_checksum));
	g_d3d8_probe_json = buffer;
	return g_d3d8_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_d3d8_texture_bind()
{
	wasm_d3d8_reset_state();

	IDirect3D8 *d3d = Direct3DCreate8(D3D_SDK_VERSION);
	IDirect3DDevice8 *device = nullptr;
	IDirect3DTexture8 *texture = nullptr;
	bool ok = d3d != nullptr;
	HRESULT create_result = E_FAIL;
	HRESULT texture_create_result = E_FAIL;
	HRESULT texture_lock_result = E_FAIL;
	HRESULT texture_unlock_result = E_FAIL;
	HRESULT bind_stage0_result = E_FAIL;
	HRESULT bind_stage1_result = E_FAIL;
	HRESULT null_stage0_result = E_FAIL;

	if (d3d != nullptr) {
		D3DPRESENT_PARAMETERS parameters = {};
		parameters.BackBufferWidth = 320;
		parameters.BackBufferHeight = 240;
		parameters.BackBufferFormat = D3DFMT_A8R8G8B8;
		parameters.BackBufferCount = 1;
		parameters.MultiSampleType = D3DMULTISAMPLE_NONE;
		parameters.SwapEffect = D3DSWAPEFFECT_DISCARD;
		parameters.Windowed = TRUE;
		parameters.EnableAutoDepthStencil = TRUE;
		parameters.AutoDepthStencilFormat = D3DFMT_D24S8;

		create_result = d3d->CreateDevice(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, nullptr,
			D3DCREATE_SOFTWARE_VERTEXPROCESSING, &parameters, &device);
		ok = ok && SUCCEEDED(create_result) && device != nullptr;
	}

	UINT texture_id = 0;
	if (device != nullptr) {
		texture_create_result = device->CreateTexture(2, 2, 1, 0,
			D3DFMT_A8R8G8B8, D3DPOOL_MANAGED, &texture);
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		texture_id = state != nullptr ? state->last_browser_texture_id : 0;
		ok = ok && SUCCEEDED(texture_create_result) && texture != nullptr && texture_id != 0;
	}

	if (texture != nullptr) {
		D3DLOCKED_RECT locked_rect = {};
		texture_lock_result = texture->LockRect(0, &locked_rect, nullptr, 0);
		if (SUCCEEDED(texture_lock_result) && locked_rect.pBits != nullptr) {
			std::memset(locked_rect.pBits, 0, static_cast<std::size_t>(locked_rect.Pitch) * 2);
			BYTE *pixel = static_cast<BYTE *>(locked_rect.pBits);
			pixel[0] = 0x11;
			pixel[1] = 0x22;
			pixel[2] = 0x33;
			pixel[3] = 0xff;
		}
		texture_unlock_result = texture->UnlockRect(0);
		ok = ok && SUCCEEDED(texture_lock_result) && SUCCEEDED(texture_unlock_result);
	}

	if (device != nullptr && texture != nullptr) {
		bind_stage0_result = device->SetTexture(0, texture);
		bind_stage1_result = device->SetTexture(1, texture);
		null_stage0_result = device->SetTexture(0, nullptr);
		ok = ok && SUCCEEDED(bind_stage0_result) && SUCCEEDED(bind_stage1_result) &&
			SUCCEEDED(null_stage0_result);
	}

	if (texture != nullptr) {
		texture->Release();
	}
	if (device != nullptr) {
		device->Release();
	}
	if (d3d != nullptr) {
		d3d->Release();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	ok = ok &&
		state != nullptr &&
		state->direct3d_create_calls == 1 &&
		state->create_device_calls == 1 &&
		state->create_texture_calls == 1 &&
		state->texture_lock_rect_calls == 1 &&
		state->texture_unlock_rect_calls == 1 &&
		state->browser_texture_create_calls == 1 &&
		state->browser_texture_update_calls == 1 &&
		state->browser_texture_bind_calls == 3 &&
		state->browser_texture_release_calls == 1 &&
		state->set_texture_calls == 3 &&
		state->last_set_texture_stage == 0 &&
		state->last_set_texture_id == 0 &&
		state->last_browser_texture_bind_stage == 0 &&
		state->last_browser_texture_bind_id == 0;

	char buffer[1700];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"browser_d3d8_texture_bind_probe\","
		"\"ok\":%s,"
		"\"results\":{\"create\":%ld,\"textureCreate\":%ld,\"textureLock\":%ld,"
		"\"textureUnlock\":%ld,\"bindStage0\":%ld,\"bindStage1\":%ld,"
		"\"nullStage0\":%ld},"
		"\"calls\":{\"direct3DCreate\":%u,\"createDevice\":%u,\"createTexture\":%u,"
		"\"textureLockRect\":%u,\"textureUnlockRect\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"browserTextureRelease\":%u,\"setTexture\":%u},"
		"\"texture\":{\"id\":%u},"
		"\"lastSetTexture\":{\"stage\":%u,\"textureId\":%u,\"type\":%u},"
		"\"lastBrowserBind\":{\"stage\":%u,\"textureId\":%u}}",
		ok ? "true" : "false",
		static_cast<long>(create_result),
		static_cast<long>(texture_create_result),
		static_cast<long>(texture_lock_result),
		static_cast<long>(texture_unlock_result),
		static_cast<long>(bind_stage0_result),
		static_cast<long>(bind_stage1_result),
		static_cast<long>(null_stage0_result),
		state != nullptr ? state->direct3d_create_calls : 0,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->texture_lock_rect_calls : 0,
		state != nullptr ? state->texture_unlock_rect_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		texture_id,
		state != nullptr ? state->last_set_texture_stage : 0,
		state != nullptr ? state->last_set_texture_id : 0,
		state != nullptr ? state->last_set_texture_type : 0,
		state != nullptr ? state->last_browser_texture_bind_stage : 0,
		state != nullptr ? state->last_browser_texture_bind_id : 0);
	g_d3d8_probe_json = buffer;
	return g_d3d8_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_d3d8_textured_quad()
{
	wasm_d3d8_reset_state();

	struct TexturedQuadVertex
	{
		float x;
		float y;
		float z;
		float nx;
		float ny;
		float nz;
		DWORD diffuse;
		float u0;
		float v0;
		float u1;
		float v1;
	};
	static_assert(sizeof(TexturedQuadVertex) == 44, "TexturedQuadVertex must match XYZNDUV2 stride");

	struct TextureStageWrite
	{
		DWORD stage;
		D3DTEXTURESTAGESTATETYPE state;
		DWORD value;
	};

	const TextureStageWrite texture_stage_writes[] = {
		{ 0, D3DTSS_COLOROP, D3DTOP_MODULATE },
		{ 0, D3DTSS_COLORARG1, D3DTA_TEXTURE },
		{ 0, D3DTSS_COLORARG2, D3DTA_DIFFUSE },
		{ 0, D3DTSS_MINFILTER, D3DTEXF_LINEAR },
		{ 0, D3DTSS_MAGFILTER, D3DTEXF_POINT },
		{ 0, D3DTSS_MIPFILTER, D3DTEXF_NONE },
		{ 0, D3DTSS_ADDRESSU, D3DTADDRESS_CLAMP },
		{ 0, D3DTSS_ADDRESSV, D3DTADDRESS_WRAP },
		{ 0, D3DTSS_TEXCOORDINDEX, 0 },
		{ 1, D3DTSS_COLOROP, D3DTOP_DISABLE },
		{ 1, D3DTSS_TEXCOORDINDEX, 1 },
	};

	IDirect3D8 *d3d = Direct3DCreate8(D3D_SDK_VERSION);
	IDirect3DDevice8 *device = nullptr;
	IDirect3DTexture8 *texture = nullptr;
	IDirect3DVertexBuffer8 *vertex_buffer = nullptr;
	IDirect3DIndexBuffer8 *index_buffer = nullptr;
	bool ok = d3d != nullptr;
	HRESULT create_result = E_FAIL;
	HRESULT clear_result = E_FAIL;
	HRESULT texture_create_result = E_FAIL;
	HRESULT texture_lock_result = E_FAIL;
	HRESULT texture_unlock_result = E_FAIL;
	HRESULT vertex_create_result = E_FAIL;
	HRESULT vertex_lock_result = E_FAIL;
	HRESULT vertex_unlock_result = E_FAIL;
	HRESULT index_create_result = E_FAIL;
	HRESULT index_lock_result = E_FAIL;
	HRESULT index_unlock_result = E_FAIL;
	HRESULT set_texture_result = E_FAIL;
	HRESULT set_stream_result = E_FAIL;
	HRESULT set_indices_result = E_FAIL;
	HRESULT draw_result = E_FAIL;
	UINT texture_id = 0;
	UINT texture_stage_write_count = 0;
	bool texture_stage_states_ok = false;

	if (d3d != nullptr) {
		D3DPRESENT_PARAMETERS parameters = {};
		parameters.BackBufferWidth = 320;
		parameters.BackBufferHeight = 240;
		parameters.BackBufferFormat = D3DFMT_A8R8G8B8;
		parameters.BackBufferCount = 1;
		parameters.MultiSampleType = D3DMULTISAMPLE_NONE;
		parameters.SwapEffect = D3DSWAPEFFECT_DISCARD;
		parameters.Windowed = TRUE;
		parameters.EnableAutoDepthStencil = TRUE;
		parameters.AutoDepthStencilFormat = D3DFMT_D24S8;

		create_result = d3d->CreateDevice(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, nullptr,
			D3DCREATE_SOFTWARE_VERTEXPROCESSING, &parameters, &device);
		ok = ok && SUCCEEDED(create_result) && device != nullptr;
	}

	if (device != nullptr) {
		clear_result = device->Clear(0, nullptr, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER,
			0xff000000UL, 1.0f, 0);
		device->SetRenderState(D3DRS_CULLMODE, D3DCULL_NONE);
		device->SetRenderState(D3DRS_ZENABLE, D3DZB_FALSE);
		device->SetRenderState(D3DRS_ZWRITEENABLE, FALSE);
		device->SetRenderState(D3DRS_ALPHABLENDENABLE, FALSE);
		device->SetRenderState(D3DRS_COLORWRITEENABLE,
			D3DCOLORWRITEENABLE_RED | D3DCOLORWRITEENABLE_GREEN |
				D3DCOLORWRITEENABLE_BLUE | D3DCOLORWRITEENABLE_ALPHA);
		ok = ok && SUCCEEDED(clear_result);
	}

	if (device != nullptr) {
		texture_create_result = device->CreateTexture(2, 2, 1, 0,
			D3DFMT_A8R8G8B8, D3DPOOL_MANAGED, &texture);
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		texture_id = state != nullptr ? state->last_browser_texture_id : 0;
		ok = ok && SUCCEEDED(texture_create_result) && texture != nullptr && texture_id != 0;
	}

	if (texture != nullptr) {
		D3DLOCKED_RECT locked_rect = {};
		texture_lock_result = texture->LockRect(0, &locked_rect, nullptr, 0);
		if (SUCCEEDED(texture_lock_result) && locked_rect.pBits != nullptr) {
			for (UINT y = 0; y < 2; ++y) {
				BYTE *row = static_cast<BYTE *>(locked_rect.pBits) +
					static_cast<std::size_t>(locked_rect.Pitch) * y;
				for (UINT x = 0; x < 2; ++x) {
					BYTE *pixel = row + x * 4;
					pixel[0] = 0x00; // B
					pixel[1] = 0x00; // G
					pixel[2] = 0xff; // R
					pixel[3] = 0xff; // A
				}
			}
		}
		texture_unlock_result = texture->UnlockRect(0);
		ok = ok && SUCCEEDED(texture_lock_result) && SUCCEEDED(texture_unlock_result);
	}

	const TexturedQuadVertex vertices[4] = {
		{ -0.75f, -0.75f, 0.0f, 0.0f, 0.0f, 1.0f, 0xffffffffUL, 0.0f, 0.0f, 0.0f, 0.0f },
		{  0.75f, -0.75f, 0.0f, 0.0f, 0.0f, 1.0f, 0xffffffffUL, 1.0f, 0.0f, 1.0f, 0.0f },
		{  0.75f,  0.75f, 0.0f, 0.0f, 0.0f, 1.0f, 0xffffffffUL, 1.0f, 1.0f, 1.0f, 1.0f },
		{ -0.75f,  0.75f, 0.0f, 0.0f, 0.0f, 1.0f, 0xffffffffUL, 0.0f, 1.0f, 0.0f, 1.0f },
	};
	const WORD indices[6] = { 0, 1, 2, 0, 2, 3 };

	if (device != nullptr) {
		vertex_create_result = device->CreateVertexBuffer(sizeof(vertices), D3DUSAGE_WRITEONLY, 0,
			D3DPOOL_MANAGED, &vertex_buffer);
		ok = ok && SUCCEEDED(vertex_create_result) && vertex_buffer != nullptr;
	}

	if (vertex_buffer != nullptr) {
		BYTE *data = nullptr;
		vertex_lock_result = vertex_buffer->Lock(0, sizeof(vertices), &data, 0);
		if (SUCCEEDED(vertex_lock_result) && data != nullptr) {
			std::memcpy(data, vertices, sizeof(vertices));
		}
		vertex_unlock_result = vertex_buffer->Unlock();
		ok = ok && SUCCEEDED(vertex_lock_result) && SUCCEEDED(vertex_unlock_result);
	}

	if (device != nullptr) {
		index_create_result = device->CreateIndexBuffer(sizeof(indices), D3DUSAGE_WRITEONLY,
			D3DFMT_INDEX16, D3DPOOL_MANAGED, &index_buffer);
		ok = ok && SUCCEEDED(index_create_result) && index_buffer != nullptr;
	}

	if (index_buffer != nullptr) {
		BYTE *data = nullptr;
		index_lock_result = index_buffer->Lock(0, sizeof(indices), &data, 0);
		if (SUCCEEDED(index_lock_result) && data != nullptr) {
			std::memcpy(data, indices, sizeof(indices));
		}
		index_unlock_result = index_buffer->Unlock();
		ok = ok && SUCCEEDED(index_lock_result) && SUCCEEDED(index_unlock_result);
	}

	if (device != nullptr && texture != nullptr && vertex_buffer != nullptr && index_buffer != nullptr) {
		texture_stage_states_ok = true;
		for (UINT index = 0; index < sizeof(texture_stage_writes) / sizeof(texture_stage_writes[0]); ++index) {
			const TextureStageWrite &write = texture_stage_writes[index];
			const HRESULT result = device->SetTextureStageState(write.stage, write.state, write.value);
			texture_stage_states_ok = texture_stage_states_ok && SUCCEEDED(result);
			if (SUCCEEDED(result)) {
				++texture_stage_write_count;
			}
		}
		set_texture_result = device->SetTexture(0, texture);
		set_stream_result = device->SetStreamSource(0, vertex_buffer, sizeof(TexturedQuadVertex));
		set_indices_result = device->SetIndices(index_buffer, 0);
		draw_result = device->DrawIndexedPrimitive(D3DPT_TRIANGLELIST, 0, 4, 0, 2);
		ok = ok && texture_stage_states_ok && SUCCEEDED(set_texture_result) && SUCCEEDED(set_stream_result) &&
			SUCCEEDED(set_indices_result) && SUCCEEDED(draw_result);
	}

	if (index_buffer != nullptr) {
		index_buffer->Release();
	}
	if (vertex_buffer != nullptr) {
		vertex_buffer->Release();
	}
	if (texture != nullptr) {
		texture->Release();
	}
	if (device != nullptr) {
		device->Release();
	}
	if (d3d != nullptr) {
		d3d->Release();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	ok = ok &&
		state != nullptr &&
		state->direct3d_create_calls == 1 &&
		state->create_device_calls == 1 &&
		state->create_texture_calls == 1 &&
		state->texture_lock_rect_calls == 1 &&
		state->texture_unlock_rect_calls == 1 &&
		state->create_vertex_buffer_calls == 1 &&
		state->create_index_buffer_calls == 1 &&
		state->buffer_lock_calls == 2 &&
		state->buffer_unlock_calls == 2 &&
		state->browser_texture_create_calls == 1 &&
		state->browser_texture_update_calls == 1 &&
		state->browser_texture_bind_calls == 1 &&
		state->browser_texture_release_calls == 1 &&
		state->browser_buffer_create_calls == 2 &&
		state->browser_buffer_update_calls == 2 &&
		state->browser_buffer_release_calls == 2 &&
		state->set_texture_calls == 1 &&
		state->set_texture_stage_state_calls == texture_stage_write_count &&
		state->last_set_texture_stage_state_stage == 1 &&
		state->last_set_texture_stage_state == D3DTSS_TEXCOORDINDEX &&
		state->last_set_texture_stage_state_value == 1 &&
		state->draw_indexed_primitive_calls == 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 4 &&
		state->last_draw_primitive_count == 2 &&
		state->last_draw_stream_source_stride == sizeof(TexturedQuadVertex) &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_COLOROP] == D3DTOP_MODULATE &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_COLORARG1] == D3DTA_TEXTURE &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_MINFILTER] == D3DTEXF_LINEAR &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_MAGFILTER] == D3DTEXF_POINT &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_ADDRESSU] == D3DTADDRESS_CLAMP &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_ADDRESSV] == D3DTADDRESS_WRAP &&
		state->last_draw_render_state.texture_stages[1].values[D3DTSS_COLOROP] == D3DTOP_DISABLE &&
		state->last_draw_render_state.texture_stages[1].values[D3DTSS_TEXCOORDINDEX] == 1;

	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;

	char buffer[4096];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"browser_d3d8_textured_quad_probe\","
		"\"ok\":%s,"
		"\"results\":{\"create\":%ld,\"clear\":%ld,\"textureCreate\":%ld,"
		"\"textureLock\":%ld,\"textureUnlock\":%ld,\"vertexCreate\":%ld,"
		"\"vertexLock\":%ld,\"vertexUnlock\":%ld,\"indexCreate\":%ld,"
		"\"indexLock\":%ld,\"indexUnlock\":%ld,\"setTexture\":%ld,"
		"\"setStream\":%ld,\"setIndices\":%ld,\"draw\":%ld},"
		"\"calls\":{\"direct3DCreate\":%u,\"createDevice\":%u,\"createTexture\":%u,"
		"\"textureLockRect\":%u,\"textureUnlockRect\":%u,"
		"\"createVertexBuffer\":%u,\"createIndexBuffer\":%u,"
		"\"bufferLock\":%u,\"bufferUnlock\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"browserTextureRelease\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"browserBufferRelease\":%u,\"setTexture\":%u,"
		"\"setTextureStageState\":%u,\"drawIndexed\":%u},"
		"\"texture\":{\"id\":%u,\"format\":%u,\"expectedCenter\":[255,0,0,255]},"
		"\"draw\":{\"primitiveType\":%u,\"vertexCount\":%u,\"primitiveCount\":%u,"
		"\"vertexStride\":%u,\"vertexBufferId\":%u,\"indexBufferId\":%u,"
		"\"renderState\":{\"cullMode\":%lu,\"zEnable\":%lu,"
		"\"alphaBlendEnable\":%lu,\"colorWriteEnable\":%lu,"
		"\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,\"colorArg2\":%lu,"
		"\"minFilter\":%lu,\"magFilter\":%lu,\"mipFilter\":%lu,"
		"\"addressU\":%lu,\"addressV\":%lu,\"texCoordIndex\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu,\"texCoordIndex\":%lu}]}}}",
		ok ? "true" : "false",
		static_cast<long>(create_result),
		static_cast<long>(clear_result),
		static_cast<long>(texture_create_result),
		static_cast<long>(texture_lock_result),
		static_cast<long>(texture_unlock_result),
		static_cast<long>(vertex_create_result),
		static_cast<long>(vertex_lock_result),
		static_cast<long>(vertex_unlock_result),
		static_cast<long>(index_create_result),
		static_cast<long>(index_lock_result),
		static_cast<long>(index_unlock_result),
		static_cast<long>(set_texture_result),
		static_cast<long>(set_stream_result),
		static_cast<long>(set_indices_result),
		static_cast<long>(draw_result),
		state != nullptr ? state->direct3d_create_calls : 0,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->texture_lock_rect_calls : 0,
		state != nullptr ? state->texture_unlock_rect_calls : 0,
		state != nullptr ? state->create_vertex_buffer_calls : 0,
		state != nullptr ? state->create_index_buffer_calls : 0,
		state != nullptr ? state->buffer_lock_calls : 0,
		state != nullptr ? state->buffer_unlock_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		texture_id,
		static_cast<unsigned int>(D3DFMT_A8R8G8B8),
		state != nullptr ? static_cast<unsigned int>(state->last_draw_primitive_type) : 0,
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		state != nullptr ? static_cast<unsigned long>(state->last_draw_render_state.cull_mode) : 0,
		state != nullptr ? static_cast<unsigned long>(state->last_draw_render_state.z_enable) : 0,
		state != nullptr ? static_cast<unsigned long>(state->last_draw_render_state.alpha_blend_enable) : 0,
		state != nullptr ? static_cast<unsigned long>(state->last_draw_render_state.color_write_enable) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_COLOROP]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_COLORARG1]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_COLORARG2]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_MINFILTER]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_MAGFILTER]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_MIPFILTER]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_ADDRESSU]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_ADDRESSV]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_TEXCOORDINDEX]) : 0,
		stage1 != nullptr ? static_cast<unsigned long>(stage1->values[D3DTSS_COLOROP]) : 0,
		stage1 != nullptr ? static_cast<unsigned long>(stage1->values[D3DTSS_TEXCOORDINDEX]) : 0);
	g_d3d8_probe_json = buffer;
	return g_d3d8_probe_json.c_str();
}

static bool fill_solid_argb_texture(
	IDirect3DTexture8 *texture,
	BYTE red,
	BYTE green,
	BYTE blue,
	BYTE alpha,
	HRESULT &lock_result,
	HRESULT &unlock_result)
{
	if (texture == nullptr) {
		lock_result = E_FAIL;
		unlock_result = E_FAIL;
		return false;
	}

	D3DLOCKED_RECT locked_rect = {};
	lock_result = texture->LockRect(0, &locked_rect, nullptr, 0);
	if (FAILED(lock_result) || locked_rect.pBits == nullptr) {
		unlock_result = E_FAIL;
		return false;
	}
	for (UINT y = 0; y < 2; ++y) {
		BYTE *row = static_cast<BYTE *>(locked_rect.pBits) +
			static_cast<std::size_t>(locked_rect.Pitch) * y;
		for (UINT x = 0; x < 2; ++x) {
			BYTE *pixel = row + x * 4;
			pixel[0] = blue;
			pixel[1] = green;
			pixel[2] = red;
			pixel[3] = alpha;
		}
	}
	unlock_result = texture->UnlockRect(0);
	return SUCCEEDED(lock_result) && SUCCEEDED(unlock_result);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_d3d8_two_texture_quad()
{
	wasm_d3d8_reset_state();

	struct TexturedQuadVertex
	{
		float x;
		float y;
		float z;
		float nx;
		float ny;
		float nz;
		DWORD diffuse;
		float u0;
		float v0;
		float u1;
		float v1;
	};

	struct TextureStageWrite
	{
		DWORD stage;
		D3DTEXTURESTAGESTATETYPE state;
		DWORD value;
	};

	const TextureStageWrite texture_stage_writes[] = {
		{ 0, D3DTSS_COLOROP, D3DTOP_SELECTARG1 },
		{ 0, D3DTSS_COLORARG1, D3DTA_TEXTURE },
		{ 0, D3DTSS_ALPHAOP, D3DTOP_SELECTARG1 },
		{ 0, D3DTSS_ALPHAARG1, D3DTA_TEXTURE },
		{ 0, D3DTSS_MINFILTER, D3DTEXF_POINT },
		{ 0, D3DTSS_MAGFILTER, D3DTEXF_POINT },
		{ 0, D3DTSS_MIPFILTER, D3DTEXF_NONE },
		{ 0, D3DTSS_ADDRESSU, D3DTADDRESS_CLAMP },
		{ 0, D3DTSS_ADDRESSV, D3DTADDRESS_CLAMP },
		{ 0, D3DTSS_TEXCOORDINDEX, 0 },
		{ 1, D3DTSS_COLOROP, D3DTOP_SELECTARG1 },
		{ 1, D3DTSS_COLORARG1, D3DTA_TEXTURE },
		{ 1, D3DTSS_MINFILTER, D3DTEXF_POINT },
		{ 1, D3DTSS_MAGFILTER, D3DTEXF_POINT },
		{ 1, D3DTSS_MIPFILTER, D3DTEXF_NONE },
		{ 1, D3DTSS_ADDRESSU, D3DTADDRESS_CLAMP },
		{ 1, D3DTSS_ADDRESSV, D3DTADDRESS_CLAMP },
		{ 1, D3DTSS_TEXCOORDINDEX, 1 },
	};

	IDirect3D8 *d3d = Direct3DCreate8(D3D_SDK_VERSION);
	IDirect3DDevice8 *device = nullptr;
	IDirect3DTexture8 *texture0 = nullptr;
	IDirect3DTexture8 *texture1 = nullptr;
	IDirect3DVertexBuffer8 *vertex_buffer = nullptr;
	IDirect3DIndexBuffer8 *index_buffer = nullptr;
	bool ok = d3d != nullptr && sizeof(TexturedQuadVertex) == 44;
	HRESULT create_result = E_FAIL;
	HRESULT clear_result = E_FAIL;
	HRESULT texture0_create_result = E_FAIL;
	HRESULT texture1_create_result = E_FAIL;
	HRESULT texture0_lock_result = E_FAIL;
	HRESULT texture0_unlock_result = E_FAIL;
	HRESULT texture1_lock_result = E_FAIL;
	HRESULT texture1_unlock_result = E_FAIL;
	HRESULT vertex_create_result = E_FAIL;
	HRESULT vertex_lock_result = E_FAIL;
	HRESULT vertex_unlock_result = E_FAIL;
	HRESULT index_create_result = E_FAIL;
	HRESULT index_lock_result = E_FAIL;
	HRESULT index_unlock_result = E_FAIL;
	HRESULT set_texture0_result = E_FAIL;
	HRESULT set_texture1_result = E_FAIL;
	HRESULT set_stream_result = E_FAIL;
	HRESULT set_indices_result = E_FAIL;
	HRESULT draw_result = E_FAIL;
	UINT texture0_id = 0;
	UINT texture1_id = 0;
	UINT texture_stage_write_count = 0;
	bool texture_stage_states_ok = false;

	if (d3d != nullptr) {
		D3DPRESENT_PARAMETERS parameters = {};
		parameters.BackBufferWidth = 320;
		parameters.BackBufferHeight = 240;
		parameters.BackBufferFormat = D3DFMT_A8R8G8B8;
		parameters.BackBufferCount = 1;
		parameters.MultiSampleType = D3DMULTISAMPLE_NONE;
		parameters.SwapEffect = D3DSWAPEFFECT_DISCARD;
		parameters.Windowed = TRUE;
		parameters.EnableAutoDepthStencil = TRUE;
		parameters.AutoDepthStencilFormat = D3DFMT_D24S8;

		create_result = d3d->CreateDevice(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, nullptr,
			D3DCREATE_SOFTWARE_VERTEXPROCESSING, &parameters, &device);
		ok = ok && SUCCEEDED(create_result) && device != nullptr;
	}

	if (device != nullptr) {
		clear_result = device->Clear(0, nullptr, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER,
			0xff000000UL, 1.0f, 0);
		device->SetRenderState(D3DRS_CULLMODE, D3DCULL_NONE);
		device->SetRenderState(D3DRS_ZENABLE, D3DZB_FALSE);
		device->SetRenderState(D3DRS_ZWRITEENABLE, FALSE);
		device->SetRenderState(D3DRS_ALPHABLENDENABLE, FALSE);
		device->SetRenderState(D3DRS_COLORWRITEENABLE,
			D3DCOLORWRITEENABLE_RED | D3DCOLORWRITEENABLE_GREEN |
				D3DCOLORWRITEENABLE_BLUE | D3DCOLORWRITEENABLE_ALPHA);
		ok = ok && SUCCEEDED(clear_result);
	}

	if (device != nullptr) {
		texture0_create_result = device->CreateTexture(2, 2, 1, 0,
			D3DFMT_A8R8G8B8, D3DPOOL_MANAGED, &texture0);
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		texture0_id = state != nullptr ? state->last_browser_texture_id : 0;
		texture1_create_result = device->CreateTexture(2, 2, 1, 0,
			D3DFMT_A8R8G8B8, D3DPOOL_MANAGED, &texture1);
		state = wasm_d3d8_get_state();
		texture1_id = state != nullptr ? state->last_browser_texture_id : 0;
		ok = ok && SUCCEEDED(texture0_create_result) && texture0 != nullptr && texture0_id != 0 &&
			SUCCEEDED(texture1_create_result) && texture1 != nullptr && texture1_id != 0 &&
			texture0_id != texture1_id;
	}

	ok = fill_solid_argb_texture(
		texture0,
		0xff,
		0x00,
		0x00,
		0xff,
		texture0_lock_result,
		texture0_unlock_result) && ok;
	ok = fill_solid_argb_texture(
		texture1,
		0x00,
		0x00,
		0xff,
		0xff,
		texture1_lock_result,
		texture1_unlock_result) && ok;

	const TexturedQuadVertex vertices[4] = {
		{ -0.75f, -0.75f, 0.0f, 0.0f, 0.0f, 1.0f, 0xffffffffUL, 0.0f, 0.0f, 0.0f, 0.0f },
		{  0.75f, -0.75f, 0.0f, 0.0f, 0.0f, 1.0f, 0xffffffffUL, 1.0f, 0.0f, 1.0f, 0.0f },
		{  0.75f,  0.75f, 0.0f, 0.0f, 0.0f, 1.0f, 0xffffffffUL, 1.0f, 1.0f, 1.0f, 1.0f },
		{ -0.75f,  0.75f, 0.0f, 0.0f, 0.0f, 1.0f, 0xffffffffUL, 0.0f, 1.0f, 0.0f, 1.0f },
	};
	const WORD indices[6] = { 0, 1, 2, 0, 2, 3 };

	if (device != nullptr) {
		vertex_create_result = device->CreateVertexBuffer(sizeof(vertices), D3DUSAGE_WRITEONLY, 0,
			D3DPOOL_MANAGED, &vertex_buffer);
		index_create_result = device->CreateIndexBuffer(sizeof(indices), D3DUSAGE_WRITEONLY,
			D3DFMT_INDEX16, D3DPOOL_MANAGED, &index_buffer);
		ok = ok && SUCCEEDED(vertex_create_result) && vertex_buffer != nullptr &&
			SUCCEEDED(index_create_result) && index_buffer != nullptr;
	}

	if (vertex_buffer != nullptr) {
		BYTE *data = nullptr;
		vertex_lock_result = vertex_buffer->Lock(0, sizeof(vertices), &data, 0);
		if (SUCCEEDED(vertex_lock_result) && data != nullptr) {
			std::memcpy(data, vertices, sizeof(vertices));
		}
		vertex_unlock_result = vertex_buffer->Unlock();
		ok = ok && SUCCEEDED(vertex_lock_result) && SUCCEEDED(vertex_unlock_result);
	}

	if (index_buffer != nullptr) {
		BYTE *data = nullptr;
		index_lock_result = index_buffer->Lock(0, sizeof(indices), &data, 0);
		if (SUCCEEDED(index_lock_result) && data != nullptr) {
			std::memcpy(data, indices, sizeof(indices));
		}
		index_unlock_result = index_buffer->Unlock();
		ok = ok && SUCCEEDED(index_lock_result) && SUCCEEDED(index_unlock_result);
	}

	if (device != nullptr && texture0 != nullptr && texture1 != nullptr &&
			vertex_buffer != nullptr && index_buffer != nullptr) {
		texture_stage_states_ok = true;
		for (UINT index = 0; index < sizeof(texture_stage_writes) / sizeof(texture_stage_writes[0]); ++index) {
			const TextureStageWrite &write = texture_stage_writes[index];
			const HRESULT result = device->SetTextureStageState(write.stage, write.state, write.value);
			texture_stage_states_ok = texture_stage_states_ok && SUCCEEDED(result);
			if (SUCCEEDED(result)) {
				++texture_stage_write_count;
			}
		}
		set_texture0_result = device->SetTexture(0, texture0);
		set_texture1_result = device->SetTexture(1, texture1);
		set_stream_result = device->SetStreamSource(0, vertex_buffer, sizeof(TexturedQuadVertex));
		set_indices_result = device->SetIndices(index_buffer, 0);
		draw_result = device->DrawIndexedPrimitive(D3DPT_TRIANGLELIST, 0, 4, 0, 2);
		ok = ok && texture_stage_states_ok && SUCCEEDED(set_texture0_result) &&
			SUCCEEDED(set_texture1_result) && SUCCEEDED(set_stream_result) &&
			SUCCEEDED(set_indices_result) && SUCCEEDED(draw_result);
	}

	if (index_buffer != nullptr) {
		index_buffer->Release();
	}
	if (vertex_buffer != nullptr) {
		vertex_buffer->Release();
	}
	if (texture1 != nullptr) {
		texture1->Release();
	}
	if (texture0 != nullptr) {
		texture0->Release();
	}
	if (device != nullptr) {
		device->Release();
	}
	if (d3d != nullptr) {
		d3d->Release();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	ok = ok &&
		state != nullptr &&
		state->direct3d_create_calls == 1 &&
		state->create_device_calls == 1 &&
		state->create_texture_calls == 2 &&
		state->texture_lock_rect_calls == 2 &&
		state->texture_unlock_rect_calls == 2 &&
		state->create_vertex_buffer_calls == 1 &&
		state->create_index_buffer_calls == 1 &&
		state->buffer_lock_calls == 2 &&
		state->buffer_unlock_calls == 2 &&
		state->browser_texture_create_calls == 2 &&
		state->browser_texture_update_calls == 2 &&
		state->browser_texture_bind_calls == 2 &&
		state->browser_texture_release_calls == 2 &&
		state->browser_buffer_create_calls == 2 &&
		state->browser_buffer_update_calls == 2 &&
		state->browser_buffer_release_calls == 2 &&
		state->set_texture_calls == 2 &&
		state->set_texture_stage_state_calls == texture_stage_write_count &&
		state->draw_indexed_primitive_calls == 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 4 &&
		state->last_draw_primitive_count == 2 &&
		state->last_draw_stream_source_stride == sizeof(TexturedQuadVertex) &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_COLOROP] == D3DTOP_SELECTARG1 &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_COLORARG1] == D3DTA_TEXTURE &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_TEXCOORDINDEX] == 0 &&
		state->last_draw_render_state.texture_stages[1].values[D3DTSS_COLOROP] == D3DTOP_SELECTARG1 &&
		state->last_draw_render_state.texture_stages[1].values[D3DTSS_COLORARG1] == D3DTA_TEXTURE &&
		state->last_draw_render_state.texture_stages[1].values[D3DTSS_TEXCOORDINDEX] == 1;

	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;

	char buffer[4096];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"browser_d3d8_two_texture_quad_probe\","
		"\"ok\":%s,"
		"\"results\":{\"create\":%ld,\"clear\":%ld,"
		"\"texture0Create\":%ld,\"texture1Create\":%ld,"
		"\"texture0Lock\":%ld,\"texture0Unlock\":%ld,"
		"\"texture1Lock\":%ld,\"texture1Unlock\":%ld,"
		"\"vertexCreate\":%ld,\"vertexLock\":%ld,\"vertexUnlock\":%ld,"
		"\"indexCreate\":%ld,\"indexLock\":%ld,\"indexUnlock\":%ld,"
		"\"setTexture0\":%ld,\"setTexture1\":%ld,"
		"\"setStream\":%ld,\"setIndices\":%ld,\"draw\":%ld},"
		"\"calls\":{\"direct3DCreate\":%u,\"createDevice\":%u,\"createTexture\":%u,"
		"\"textureLockRect\":%u,\"textureUnlockRect\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"browserTextureRelease\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"browserBufferRelease\":%u,\"setTexture\":%u,"
		"\"setTextureStageState\":%u,\"drawIndexed\":%u},"
		"\"textures\":{\"stage0\":{\"id\":%u,\"format\":%u,\"color\":\"red\"},"
		"\"stage1\":{\"id\":%u,\"format\":%u,\"color\":\"blue\","
		"\"expectedCenter\":[0,0,255,255]}},"
		"\"draw\":{\"primitiveType\":%u,\"vertexCount\":%u,\"primitiveCount\":%u,"
		"\"vertexStride\":%u,\"vertexBufferId\":%u,\"indexBufferId\":%u,"
		"\"renderState\":{\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,\"texCoordIndex\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu,\"colorArg1\":%lu,\"texCoordIndex\":%lu}]}}}",
		ok ? "true" : "false",
		static_cast<long>(create_result),
		static_cast<long>(clear_result),
		static_cast<long>(texture0_create_result),
		static_cast<long>(texture1_create_result),
		static_cast<long>(texture0_lock_result),
		static_cast<long>(texture0_unlock_result),
		static_cast<long>(texture1_lock_result),
		static_cast<long>(texture1_unlock_result),
		static_cast<long>(vertex_create_result),
		static_cast<long>(vertex_lock_result),
		static_cast<long>(vertex_unlock_result),
		static_cast<long>(index_create_result),
		static_cast<long>(index_lock_result),
		static_cast<long>(index_unlock_result),
		static_cast<long>(set_texture0_result),
		static_cast<long>(set_texture1_result),
		static_cast<long>(set_stream_result),
		static_cast<long>(set_indices_result),
		static_cast<long>(draw_result),
		state != nullptr ? state->direct3d_create_calls : 0,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->texture_lock_rect_calls : 0,
		state != nullptr ? state->texture_unlock_rect_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		texture0_id,
		static_cast<unsigned int>(D3DFMT_A8R8G8B8),
		texture1_id,
		static_cast<unsigned int>(D3DFMT_A8R8G8B8),
		state != nullptr ? static_cast<unsigned int>(state->last_draw_primitive_type) : 0,
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_COLOROP]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_COLORARG1]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_TEXCOORDINDEX]) : 0,
		stage1 != nullptr ? static_cast<unsigned long>(stage1->values[D3DTSS_COLOROP]) : 0,
		stage1 != nullptr ? static_cast<unsigned long>(stage1->values[D3DTSS_COLORARG1]) : 0,
		stage1 != nullptr ? static_cast<unsigned long>(stage1->values[D3DTSS_TEXCOORDINDEX]) : 0);
	g_d3d8_probe_json = buffer;
	return g_d3d8_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_d3d8_texture_mip_chain_draw(unsigned int mip_case)
{
	wasm_d3d8_reset_state();

	struct TexturedQuadVertex
	{
		float x;
		float y;
		float z;
		float nx;
		float ny;
		float nz;
		DWORD diffuse;
		float u0;
		float v0;
		float u1;
		float v1;
	};

	const bool complete_mip_chain = mip_case != 0;
	if (mip_case > 3) {
		char error_buffer[256];
		std::snprintf(error_buffer, sizeof(error_buffer),
			"{\"source\":\"browser_d3d8_texture_mip_chain_draw_probe\","
			"\"caseId\":%u,\"error\":\"unknown mip-chain draw case\"}",
			mip_case);
		g_d3d8_probe_json = error_buffer;
		return g_d3d8_probe_json.c_str();
	}

	const char *case_name = "IncompleteMipFallback";
	BYTE expected_r = 0xff;
	BYTE expected_g = 0x00;
	BYTE expected_b = 0x00;
	float uv_extent = 1024.0f;
	DWORD max_mip_level = 0;
	float mip_lod_bias = 0.0f;
	DWORD mip_filter = D3DTEXF_POINT;
	if (mip_case == 1) {
		case_name = "CompleteMipChain";
		expected_r = 0x00;
		expected_b = 0xff;
	} else if (mip_case == 2) {
		case_name = "MaxMipLevelBase";
		expected_r = 0x00;
		expected_g = 0xff;
		uv_extent = 1.0f;
		max_mip_level = 1;
		mip_filter = D3DTEXF_NONE;
	} else if (mip_case == 3) {
		case_name = "LodBiasSmallest";
		expected_r = 0x00;
		expected_b = 0xff;
		uv_extent = 1.0f;
		mip_lod_bias = 12.0f;
	}
	const UINT uploaded_levels = complete_mip_chain ? 3 : 1;
	const char *initialized_levels_json = complete_mip_chain ? "[0,1,2]" : "[0]";
	const DWORD mip_lod_bias_bits = d3d8_float_bits(mip_lod_bias);

	IDirect3D8 *d3d = Direct3DCreate8(D3D_SDK_VERSION);
	IDirect3DDevice8 *device = nullptr;
	IDirect3DTexture8 *texture = nullptr;
	IDirect3DVertexBuffer8 *vertex_buffer = nullptr;
	IDirect3DIndexBuffer8 *index_buffer = nullptr;
	bool ok = d3d != nullptr && sizeof(TexturedQuadVertex) == 44;
	HRESULT create_result = E_FAIL;
	HRESULT clear_result = E_FAIL;
	HRESULT texture_create_result = E_FAIL;
	HRESULT texture_lock_results[3] = { E_FAIL, E_FAIL, E_FAIL };
	HRESULT texture_unlock_results[3] = { E_FAIL, E_FAIL, E_FAIL };
	HRESULT vertex_create_result = E_FAIL;
	HRESULT vertex_lock_result = E_FAIL;
	HRESULT vertex_unlock_result = E_FAIL;
	HRESULT index_create_result = E_FAIL;
	HRESULT index_lock_result = E_FAIL;
	HRESULT index_unlock_result = E_FAIL;
	HRESULT set_texture_result = E_FAIL;
	HRESULT set_stream_result = E_FAIL;
	HRESULT set_indices_result = E_FAIL;
	HRESULT draw_result = E_FAIL;
	UINT texture_id = 0;
	UINT texture_stage_write_count = 0;

	if (d3d != nullptr) {
		D3DPRESENT_PARAMETERS parameters = {};
		parameters.BackBufferWidth = 320;
		parameters.BackBufferHeight = 240;
		parameters.BackBufferFormat = D3DFMT_A8R8G8B8;
		parameters.BackBufferCount = 1;
		parameters.MultiSampleType = D3DMULTISAMPLE_NONE;
		parameters.SwapEffect = D3DSWAPEFFECT_DISCARD;
		parameters.Windowed = TRUE;
		parameters.EnableAutoDepthStencil = TRUE;
		parameters.AutoDepthStencilFormat = D3DFMT_D24S8;

		create_result = d3d->CreateDevice(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, nullptr,
			D3DCREATE_SOFTWARE_VERTEXPROCESSING, &parameters, &device);
		ok = ok && SUCCEEDED(create_result) && device != nullptr;
	}

	if (device != nullptr) {
		clear_result = device->Clear(0, nullptr, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER,
			0xff000000UL, 1.0f, 0);
		device->SetRenderState(D3DRS_CULLMODE, D3DCULL_NONE);
		device->SetRenderState(D3DRS_ZENABLE, D3DZB_FALSE);
		device->SetRenderState(D3DRS_ZWRITEENABLE, FALSE);
		device->SetRenderState(D3DRS_ALPHABLENDENABLE, FALSE);
		device->SetRenderState(D3DRS_COLORWRITEENABLE,
			D3DCOLORWRITEENABLE_RED | D3DCOLORWRITEENABLE_GREEN |
				D3DCOLORWRITEENABLE_BLUE | D3DCOLORWRITEENABLE_ALPHA);
		ok = ok && SUCCEEDED(clear_result);
	}

	if (device != nullptr) {
		texture_create_result = device->CreateTexture(4, 4, 3, 0,
			D3DFMT_A8R8G8B8, D3DPOOL_MANAGED, &texture);
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		texture_id = state != nullptr ? state->last_browser_texture_id : 0;
		ok = ok && SUCCEEDED(texture_create_result) && texture != nullptr && texture_id != 0;
	}

	if (texture != nullptr) {
		const UINT level_widths[3] = { 4, 2, 1 };
		const UINT level_heights[3] = { 4, 2, 1 };
		const BYTE bgra_colors[3][4] = {
			{ 0x00, 0x00, 0xff, 0xff },
			{ 0x00, 0xff, 0x00, 0xff },
			{ 0xff, 0x00, 0x00, 0xff },
		};
		for (UINT level = 0; level < uploaded_levels; ++level) {
			D3DLOCKED_RECT locked_rect = {};
			texture_lock_results[level] = texture->LockRect(level, &locked_rect, nullptr, 0);
			if (SUCCEEDED(texture_lock_results[level]) && locked_rect.pBits != nullptr) {
				for (UINT y = 0; y < level_heights[level]; ++y) {
					BYTE *row = static_cast<BYTE *>(locked_rect.pBits) +
						static_cast<std::size_t>(locked_rect.Pitch) * y;
					for (UINT x = 0; x < level_widths[level]; ++x) {
						std::memcpy(row + x * 4, bgra_colors[level], 4);
					}
				}
			}
			texture_unlock_results[level] = texture->UnlockRect(level);
			ok = ok && SUCCEEDED(texture_lock_results[level]) &&
				SUCCEEDED(texture_unlock_results[level]);
		}
	}

	const TexturedQuadVertex vertices[4] = {
		{ -0.75f, -0.75f, 0.0f, 0.0f, 0.0f, 1.0f, 0xffffffffUL, 0.0f, 0.0f, 0.0f, 0.0f },
		{  0.75f, -0.75f, 0.0f, 0.0f, 0.0f, 1.0f, 0xffffffffUL, uv_extent, 0.0f, 1.0f, 0.0f },
		{  0.75f,  0.75f, 0.0f, 0.0f, 0.0f, 1.0f, 0xffffffffUL, uv_extent, uv_extent, 1.0f, 1.0f },
		{ -0.75f,  0.75f, 0.0f, 0.0f, 0.0f, 1.0f, 0xffffffffUL, 0.0f, uv_extent, 0.0f, 1.0f },
	};
	const WORD indices[6] = { 0, 1, 2, 0, 2, 3 };

	if (device != nullptr) {
		vertex_create_result = device->CreateVertexBuffer(sizeof(vertices), D3DUSAGE_WRITEONLY, 0,
			D3DPOOL_MANAGED, &vertex_buffer);
		ok = ok && SUCCEEDED(vertex_create_result) && vertex_buffer != nullptr;
	}

	if (vertex_buffer != nullptr) {
		BYTE *data = nullptr;
		vertex_lock_result = vertex_buffer->Lock(0, sizeof(vertices), &data, 0);
		if (SUCCEEDED(vertex_lock_result) && data != nullptr) {
			std::memcpy(data, vertices, sizeof(vertices));
		}
		vertex_unlock_result = vertex_buffer->Unlock();
		ok = ok && SUCCEEDED(vertex_lock_result) && SUCCEEDED(vertex_unlock_result);
	}

	if (device != nullptr) {
		index_create_result = device->CreateIndexBuffer(sizeof(indices), D3DUSAGE_WRITEONLY,
			D3DFMT_INDEX16, D3DPOOL_MANAGED, &index_buffer);
		ok = ok && SUCCEEDED(index_create_result) && index_buffer != nullptr;
	}

	if (index_buffer != nullptr) {
		BYTE *data = nullptr;
		index_lock_result = index_buffer->Lock(0, sizeof(indices), &data, 0);
		if (SUCCEEDED(index_lock_result) && data != nullptr) {
			std::memcpy(data, indices, sizeof(indices));
		}
		index_unlock_result = index_buffer->Unlock();
		ok = ok && SUCCEEDED(index_lock_result) && SUCCEEDED(index_unlock_result);
	}

	if (device != nullptr && texture != nullptr && vertex_buffer != nullptr && index_buffer != nullptr) {
		struct TextureStageWrite
		{
			DWORD stage;
			D3DTEXTURESTAGESTATETYPE state;
			DWORD value;
		};
		const TextureStageWrite texture_stage_writes[] = {
			{ 0, D3DTSS_COLOROP, D3DTOP_SELECTARG1 },
			{ 0, D3DTSS_COLORARG1, D3DTA_TEXTURE },
			{ 0, D3DTSS_COLORARG2, D3DTA_DIFFUSE },
			{ 0, D3DTSS_ALPHAOP, D3DTOP_SELECTARG1 },
			{ 0, D3DTSS_ALPHAARG1, D3DTA_TEXTURE },
			{ 0, D3DTSS_ALPHAARG2, D3DTA_DIFFUSE },
			{ 0, D3DTSS_MINFILTER, D3DTEXF_POINT },
			{ 0, D3DTSS_MAGFILTER, D3DTEXF_POINT },
			{ 0, D3DTSS_MIPFILTER, mip_filter },
			{ 0, D3DTSS_MIPMAPLODBIAS, mip_lod_bias_bits },
			{ 0, D3DTSS_MAXMIPLEVEL, max_mip_level },
			{ 0, D3DTSS_ADDRESSU, D3DTADDRESS_WRAP },
			{ 0, D3DTSS_ADDRESSV, D3DTADDRESS_WRAP },
			{ 0, D3DTSS_TEXCOORDINDEX, D3DTSS_TCI_PASSTHRU | 0 },
			{ 0, D3DTSS_TEXTURETRANSFORMFLAGS, D3DTTFF_DISABLE },
			{ 1, D3DTSS_COLOROP, D3DTOP_DISABLE },
		};
		for (UINT index = 0; index < sizeof(texture_stage_writes) / sizeof(texture_stage_writes[0]); ++index) {
			const TextureStageWrite &write = texture_stage_writes[index];
			if (SUCCEEDED(device->SetTextureStageState(write.stage, write.state, write.value))) {
				++texture_stage_write_count;
			}
		}
		set_texture_result = device->SetTexture(0, texture);
		set_stream_result = device->SetStreamSource(0, vertex_buffer, sizeof(TexturedQuadVertex));
		set_indices_result = device->SetIndices(index_buffer, 0);
		draw_result = device->DrawIndexedPrimitive(D3DPT_TRIANGLELIST, 0, 4, 0, 2);
		ok = ok && texture_stage_write_count == sizeof(texture_stage_writes) / sizeof(texture_stage_writes[0]) &&
			SUCCEEDED(set_texture_result) && SUCCEEDED(set_stream_result) &&
			SUCCEEDED(set_indices_result) && SUCCEEDED(draw_result);
	}

	if (index_buffer != nullptr) {
		index_buffer->Release();
	}
	if (vertex_buffer != nullptr) {
		vertex_buffer->Release();
	}
	if (texture != nullptr) {
		texture->Release();
	}
	if (device != nullptr) {
		device->Release();
	}
	if (d3d != nullptr) {
		d3d->Release();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	ok = ok &&
		state != nullptr &&
		state->direct3d_create_calls == 1 &&
		state->create_device_calls == 1 &&
		state->create_texture_calls == 1 &&
		state->texture_lock_rect_calls == uploaded_levels &&
		state->texture_unlock_rect_calls == uploaded_levels &&
		state->create_vertex_buffer_calls == 1 &&
		state->create_index_buffer_calls == 1 &&
		state->buffer_lock_calls == 2 &&
		state->buffer_unlock_calls == 2 &&
		state->browser_texture_create_calls == 1 &&
		state->browser_texture_update_calls == uploaded_levels &&
		state->browser_texture_bind_calls == 1 &&
		state->browser_texture_release_calls == 1 &&
		state->browser_buffer_create_calls == 2 &&
		state->browser_buffer_update_calls == 2 &&
		state->browser_buffer_release_calls == 2 &&
		state->set_texture_calls == 1 &&
		state->set_texture_stage_state_calls == texture_stage_write_count &&
		state->draw_indexed_primitive_calls == 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 4 &&
		state->last_draw_primitive_count == 2 &&
		state->last_draw_stream_source_stride == sizeof(TexturedQuadVertex) &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_COLOROP] == D3DTOP_SELECTARG1 &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_COLORARG1] == D3DTA_TEXTURE &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_MIPFILTER] == mip_filter &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_MIPMAPLODBIAS] == mip_lod_bias_bits &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_MAXMIPLEVEL] == max_mip_level;

	char buffer[8192];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"browser_d3d8_texture_mip_chain_draw_probe\","
		"\"ok\":%s,\"caseId\":%u,\"caseName\":\"%s\","
		"\"results\":{\"create\":%ld,\"clear\":%ld,\"textureCreate\":%ld,"
		"\"textureLock0\":%ld,\"textureUnlock0\":%ld,"
		"\"textureLock1\":%ld,\"textureUnlock1\":%ld,"
		"\"textureLock2\":%ld,\"textureUnlock2\":%ld,"
		"\"vertexCreate\":%ld,\"vertexLock\":%ld,\"vertexUnlock\":%ld,"
		"\"indexCreate\":%ld,\"indexLock\":%ld,\"indexUnlock\":%ld,"
		"\"setTexture\":%ld,\"setStream\":%ld,\"setIndices\":%ld,\"draw\":%ld},"
		"\"calls\":{\"direct3DCreate\":%u,\"createDevice\":%u,\"createTexture\":%u,"
		"\"textureLockRect\":%u,\"textureUnlockRect\":%u,"
		"\"createVertexBuffer\":%u,\"createIndexBuffer\":%u,"
		"\"bufferLock\":%u,\"bufferUnlock\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"browserTextureRelease\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"browserBufferRelease\":%u,\"setTexture\":%u,"
		"\"setTextureStageState\":%u,\"drawIndexed\":%u},"
		"\"texture\":{\"id\":%u,\"format\":%u,\"levels\":3,\"uploadedLevels\":%u,"
		"\"completeMipChain\":%s,\"initializedLevels\":%s,\"uvExtent\":%.1f,"
		"\"mipFilter\":%lu,\"maxMipLevel\":%lu,\"mipMapLodBiasBits\":%lu,"
		"\"mipMapLodBias\":%.1f},"
		"\"expectedCenter\":[%u,%u,%u,255]}",
		ok ? "true" : "false",
		mip_case,
		case_name,
		static_cast<long>(create_result),
		static_cast<long>(clear_result),
		static_cast<long>(texture_create_result),
		static_cast<long>(texture_lock_results[0]),
		static_cast<long>(texture_unlock_results[0]),
		static_cast<long>(texture_lock_results[1]),
		static_cast<long>(texture_unlock_results[1]),
		static_cast<long>(texture_lock_results[2]),
		static_cast<long>(texture_unlock_results[2]),
		static_cast<long>(vertex_create_result),
		static_cast<long>(vertex_lock_result),
		static_cast<long>(vertex_unlock_result),
		static_cast<long>(index_create_result),
		static_cast<long>(index_lock_result),
		static_cast<long>(index_unlock_result),
		static_cast<long>(set_texture_result),
		static_cast<long>(set_stream_result),
		static_cast<long>(set_indices_result),
		static_cast<long>(draw_result),
		state != nullptr ? state->direct3d_create_calls : 0,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->texture_lock_rect_calls : 0,
		state != nullptr ? state->texture_unlock_rect_calls : 0,
		state != nullptr ? state->create_vertex_buffer_calls : 0,
		state != nullptr ? state->create_index_buffer_calls : 0,
		state != nullptr ? state->buffer_lock_calls : 0,
		state != nullptr ? state->buffer_unlock_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		texture_id,
		static_cast<unsigned int>(D3DFMT_A8R8G8B8),
		uploaded_levels,
		complete_mip_chain ? "true" : "false",
		initialized_levels_json,
		static_cast<double>(uv_extent),
		static_cast<unsigned long>(mip_filter),
		static_cast<unsigned long>(max_mip_level),
		static_cast<unsigned long>(mip_lod_bias_bits),
		static_cast<double>(mip_lod_bias),
		static_cast<unsigned int>(expected_r),
		static_cast<unsigned int>(expected_g),
		static_cast<unsigned int>(expected_b));
	g_d3d8_probe_json = buffer;
	return g_d3d8_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_d3d8_texture_combiner(unsigned int combiner_case)
{
	wasm_d3d8_reset_state();

	struct TexturedQuadVertex
	{
		float x;
		float y;
		float z;
		float nx;
		float ny;
		float nz;
		DWORD diffuse;
		float u0;
		float v0;
		float u1;
		float v1;
	};

	const char *case_name = "unknown";
	DWORD color_op = D3DTOP_MODULATE;
	DWORD color_arg0 = D3DTA_CURRENT;
	DWORD color_arg1 = D3DTA_TEXTURE;
	DWORD color_arg2 = D3DTA_DIFFUSE;
	DWORD result_arg = D3DTA_CURRENT;
	// D3D8 stage-0 ALPHAOP defaults: SELECTARG1 over TEXTURE/CURRENT.
	DWORD alpha_op = D3DTOP_SELECTARG1;
	DWORD alpha_arg0 = D3DTA_CURRENT;
	DWORD alpha_arg1 = D3DTA_TEXTURE;
	DWORD alpha_arg2 = D3DTA_CURRENT;
	DWORD stage1_color_op = D3DTOP_DISABLE;
	DWORD stage1_color_arg0 = D3DTA_CURRENT;
	DWORD stage1_color_arg1 = D3DTA_TEXTURE;
	DWORD stage1_color_arg2 = D3DTA_CURRENT;
	DWORD stage1_alpha_op = D3DTOP_DISABLE;
	DWORD stage1_alpha_arg0 = D3DTA_CURRENT;
	DWORD stage1_alpha_arg1 = D3DTA_TEXTURE;
	DWORD stage1_alpha_arg2 = D3DTA_CURRENT;
	DWORD diffuse = 0xffffffffUL;
	BYTE texture_red = 0xff;
	BYTE texture_green = 0x00;
	BYTE texture_blue = 0x00;
	BYTE texture_alpha = 0xff;
	bool alpha_case = false;
	bool color_arg0_set = false;
	bool alpha_arg0_set = false;
	bool result_arg_set = false;
	bool stage1_color_arg0_set = false;
	bool stage1_color_arg1_set = false;
	bool stage1_color_arg2_set = false;
	bool stage1_alpha_op_set = false;
	bool stage1_alpha_arg0_set = false;
	bool stage1_alpha_arg1_set = false;
	bool stage1_alpha_arg2_set = false;
	DWORD texture_factor = 0xffffffffUL;
	unsigned int expected_stage_state_calls = 14;
	unsigned int expected_r = 255;
	unsigned int expected_g = 0;
	unsigned int expected_b = 0;
	unsigned int expected_a = 255;
	bool known_case = true;
	switch (combiner_case) {
		case 0:
			case_name = "selectTexture";
			color_op = D3DTOP_SELECTARG1;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			diffuse = 0xff00ff00UL;
			break;
		case 1:
			case_name = "selectDiffuse";
			color_op = D3DTOP_SELECTARG2;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			diffuse = 0xff00ff00UL;
			expected_r = 0;
			expected_g = 255;
			break;
		case 2:
			case_name = "modulate";
			color_op = D3DTOP_MODULATE;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			diffuse = 0xff808080UL;
			expected_r = 128;
			break;
		case 3:
			case_name = "add";
			color_op = D3DTOP_ADD;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			diffuse = 0xff00ff00UL;
			expected_g = 255;
			break;
		// Alpha-combiner cases: COLOROP selects the red texture RGB, while
		// ALPHAOP/ALPHAARG1/ALPHAARG2 drive the output alpha. The result is
		// observed through alpha blending (SRCALPHA/INVSRCALPHA) against an
		// opaque black clear, so the canvas center pixel exposes the alpha
		// combiner output as red*alpha even though the WebGL canvas itself is
		// opaque (alpha:false).
		case 4:
			case_name = "selectAlphaTexture";
			color_op = D3DTOP_SELECTARG1;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			alpha_op = D3DTOP_SELECTARG1;
			alpha_arg1 = D3DTA_TEXTURE;
			alpha_arg2 = D3DTA_DIFFUSE;
			texture_alpha = 0x80;
			diffuse = 0xff808080UL;
			alpha_case = true;
			expected_r = 128;
			break;
		case 5:
			case_name = "selectAlphaDiffuse";
			color_op = D3DTOP_SELECTARG1;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			alpha_op = D3DTOP_SELECTARG2;
			alpha_arg1 = D3DTA_TEXTURE;
			alpha_arg2 = D3DTA_DIFFUSE;
			texture_alpha = 0xff;
			diffuse = 0x40808080UL;
			alpha_case = true;
			expected_r = 64;
			break;
		case 6:
			case_name = "modulateAlpha";
			color_op = D3DTOP_SELECTARG1;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			alpha_op = D3DTOP_MODULATE;
			alpha_arg1 = D3DTA_TEXTURE;
			alpha_arg2 = D3DTA_DIFFUSE;
			texture_alpha = 0xc0;
			diffuse = 0x80808080UL;
			alpha_case = true;
			expected_r = 96;
			break;
		case 7:
			case_name = "addAlpha";
			color_op = D3DTOP_SELECTARG1;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			alpha_op = D3DTOP_ADD;
			alpha_arg1 = D3DTA_TEXTURE;
			alpha_arg2 = D3DTA_DIFFUSE;
			texture_alpha = 0x20;
			diffuse = 0x20808080UL;
			alpha_case = true;
			expected_r = 64;
			break;
		case 8:
			case_name = "complementTexture";
			color_op = D3DTOP_SELECTARG1;
			color_arg1 = D3DTA_TEXTURE | D3DTA_COMPLEMENT;
			color_arg2 = D3DTA_DIFFUSE;
			diffuse = 0xff808080UL;
			expected_r = 0;
			expected_g = 255;
			expected_b = 255;
			break;
		case 9:
			case_name = "alphaReplicateTexture";
			color_op = D3DTOP_SELECTARG1;
			color_arg1 = D3DTA_TEXTURE | D3DTA_ALPHAREPLICATE;
			color_arg2 = D3DTA_DIFFUSE;
			texture_alpha = 0x40;
			diffuse = 0xff808080UL;
			expected_r = 64;
			expected_g = 64;
			expected_b = 64;
			break;
		case 10:
			case_name = "alphaReplicateComplementTexture";
			color_op = D3DTOP_SELECTARG1;
			color_arg1 = D3DTA_TEXTURE | D3DTA_ALPHAREPLICATE | D3DTA_COMPLEMENT;
			color_arg2 = D3DTA_DIFFUSE;
			texture_alpha = 0x40;
			diffuse = 0xff808080UL;
			expected_r = 191;
			expected_g = 191;
			expected_b = 191;
			break;
		case 11:
			case_name = "complementAlphaTexture";
			color_op = D3DTOP_SELECTARG1;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			alpha_op = D3DTOP_SELECTARG1;
			alpha_arg1 = D3DTA_TEXTURE | D3DTA_COMPLEMENT;
			alpha_arg2 = D3DTA_DIFFUSE;
			texture_alpha = 0x40;
			diffuse = 0xff808080UL;
			alpha_case = true;
			expected_r = 191;
			break;
		case 12:
			case_name = "alphaReplicateComplementDiffuse";
			color_op = D3DTOP_SELECTARG1;
			color_arg1 = D3DTA_DIFFUSE | D3DTA_ALPHAREPLICATE | D3DTA_COMPLEMENT;
			color_arg2 = D3DTA_TEXTURE;
			diffuse = 0x40808080UL;
			expected_r = 191;
			expected_g = 191;
			expected_b = 191;
			break;
		case 13:
			case_name = "selectTextureFactor";
			color_op = D3DTOP_SELECTARG1;
			color_arg1 = D3DTA_TFACTOR;
			color_arg2 = D3DTA_TEXTURE;
			texture_factor = 0xff204080UL;
			diffuse = 0xff808080UL;
			expected_r = 32;
			expected_g = 64;
			expected_b = 128;
			break;
		case 14:
			case_name = "modulateTextureFactor";
			color_op = D3DTOP_MODULATE;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_TFACTOR;
			texture_factor = 0xff800000UL;
			diffuse = 0xff808080UL;
			expected_r = 128;
			break;
		case 15:
			case_name = "selectAlphaTextureFactor";
			color_op = D3DTOP_SELECTARG1;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			alpha_op = D3DTOP_SELECTARG1;
			alpha_arg1 = D3DTA_TFACTOR;
			alpha_arg2 = D3DTA_TEXTURE;
			texture_factor = 0x40000000UL;
			diffuse = 0xff808080UL;
			alpha_case = true;
			expected_r = 64;
			break;
		case 16:
			case_name = "alphaReplicateTextureFactor";
			color_op = D3DTOP_SELECTARG1;
			color_arg1 = D3DTA_TFACTOR | D3DTA_ALPHAREPLICATE;
			color_arg2 = D3DTA_TEXTURE;
			texture_factor = 0x80204060UL;
			diffuse = 0xff808080UL;
			expected_r = 128;
			expected_g = 128;
			expected_b = 128;
			break;
		case 17:
			case_name = "multiplyAddColorArg0";
			color_op = D3DTOP_MULTIPLYADD;
			color_arg0 = D3DTA_TFACTOR | D3DTA_ALPHAREPLICATE;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_TFACTOR | D3DTA_ALPHAREPLICATE;
			texture_factor = 0x80204060UL;
			diffuse = 0xff808080UL;
			color_arg0_set = true;
			expected_r = 255;
			expected_g = 128;
			expected_b = 128;
			break;
		case 18:
			case_name = "multiplyAddAlphaArg0";
			color_op = D3DTOP_SELECTARG1;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			alpha_op = D3DTOP_MULTIPLYADD;
			alpha_arg0 = D3DTA_TFACTOR;
			alpha_arg1 = D3DTA_TEXTURE;
			alpha_arg2 = D3DTA_DIFFUSE;
			texture_factor = 0x80000000UL;
			texture_alpha = 0x40;
			diffuse = 0x80808080UL;
			alpha_case = true;
			alpha_arg0_set = true;
			expected_r = 160;
			break;
		case 19:
			case_name = "stage1DotProduct3Grayscale";
			color_op = D3DTOP_MULTIPLYADD;
			color_arg0 = D3DTA_TFACTOR | D3DTA_ALPHAREPLICATE;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_TFACTOR | D3DTA_ALPHAREPLICATE;
			stage1_color_op = D3DTOP_DOTPRODUCT3;
			stage1_color_arg1 = D3DTA_CURRENT;
			stage1_color_arg2 = D3DTA_TFACTOR;
			texture_factor = 0x80a5ca8eUL;
			texture_red = 0x40;
			texture_green = 0x80;
			texture_blue = 0xc0;
			diffuse = 0xffffffffUL;
			color_arg0_set = true;
			stage1_color_arg1_set = true;
			stage1_color_arg2_set = true;
			expected_r = 117;
			expected_g = 117;
			expected_b = 117;
			break;
		case 20:
			case_name = "resultArgTempPreservesCurrent";
			color_op = D3DTOP_SELECTARG1;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			result_arg = D3DTA_TEMP;
			stage1_color_op = D3DTOP_SELECTARG1;
			stage1_color_arg1 = D3DTA_CURRENT;
			diffuse = 0xff00ff00UL;
			result_arg_set = true;
			stage1_color_arg1_set = true;
			expected_r = 0;
			expected_g = 255;
			expected_b = 0;
			break;
		case 21:
			case_name = "stage1SelectTemp";
			color_op = D3DTOP_SELECTARG1;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			result_arg = D3DTA_TEMP;
			stage1_color_op = D3DTOP_SELECTARG1;
			stage1_color_arg1 = D3DTA_TEMP;
			diffuse = 0xff00ff00UL;
			result_arg_set = true;
			stage1_color_arg1_set = true;
			expected_r = 255;
			expected_g = 0;
			expected_b = 0;
			break;
		case 22:
			case_name = "modulate2X";
			color_op = D3DTOP_MODULATE2X;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			texture_red = 0x40;
			diffuse = 0xff800000UL;
			expected_r = 64;
			break;
		case 23:
			case_name = "modulate4X";
			color_op = D3DTOP_MODULATE4X;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			texture_red = 0x40;
			diffuse = 0xff800000UL;
			expected_r = 128;
			break;
		case 24:
			case_name = "addSigned";
			color_op = D3DTOP_ADDSIGNED;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			diffuse = 0xff00ff00UL;
			expected_r = 128;
			expected_g = 128;
			expected_b = 0;
			break;
		case 25:
			case_name = "addSigned2X";
			color_op = D3DTOP_ADDSIGNED2X;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			texture_red = 0xff;
			diffuse = 0xff00ff00UL;
			expected_r = 255;
			expected_g = 255;
			expected_b = 0;
			break;
		case 26:
			case_name = "subtract";
			color_op = D3DTOP_SUBTRACT;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			texture_red = 0xff;
			texture_green = 0x80;
			texture_blue = 0x40;
			diffuse = 0xff402080UL;
			expected_r = 191;
			expected_g = 96;
			expected_b = 0;
			break;
		case 27:
			case_name = "addSmooth";
			color_op = D3DTOP_ADDSMOOTH;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			texture_red = 0x80;
			diffuse = 0xff808080UL;
			expected_r = 192;
			expected_g = 128;
			expected_b = 128;
			break;
		case 28:
			case_name = "blendTextureAlpha";
			color_op = D3DTOP_BLENDTEXTUREALPHA;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			texture_alpha = 0x40;
			diffuse = 0xff00ff00UL;
			expected_r = 64;
			expected_g = 191;
			expected_b = 0;
			break;
		case 29:
			case_name = "blendFactorAlpha";
			color_op = D3DTOP_BLENDFACTORALPHA;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			texture_factor = 0x40000000UL;
			diffuse = 0xff00ff00UL;
			expected_r = 64;
			expected_g = 191;
			expected_b = 0;
			break;
		case 30:
			case_name = "blendCurrentAlpha";
			color_op = D3DTOP_BLENDCURRENTALPHA;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			diffuse = 0x8000ff00UL;
			expected_r = 128;
			expected_g = 127;
			expected_b = 0;
			break;
		case 31:
			case_name = "lerpColorArg0";
			color_op = D3DTOP_LERP;
			color_arg0 = D3DTA_TFACTOR | D3DTA_ALPHAREPLICATE;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			texture_factor = 0x40000000UL;
			diffuse = 0xff00ff00UL;
			color_arg0_set = true;
			expected_r = 64;
			expected_g = 191;
			expected_b = 0;
			break;
		case 32:
			case_name = "blendDiffuseAlpha";
			color_op = D3DTOP_BLENDDIFFUSEALPHA;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			diffuse = 0x4000ff00UL;
			expected_r = 64;
			expected_g = 191;
			expected_b = 0;
			break;
		case 33:
			case_name = "stage1MultiplyAddColorArg0";
			color_op = D3DTOP_SELECTARG1;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			stage1_color_op = D3DTOP_MULTIPLYADD;
			stage1_color_arg0 = D3DTA_TFACTOR | D3DTA_ALPHAREPLICATE;
			stage1_color_arg1 = D3DTA_CURRENT;
			stage1_color_arg2 = D3DTA_TFACTOR | D3DTA_ALPHAREPLICATE;
			texture_factor = 0x40000000UL;
			stage1_color_arg0_set = true;
			stage1_color_arg1_set = true;
			stage1_color_arg2_set = true;
			expected_r = 128;
			expected_g = 64;
			expected_b = 64;
			break;
		case 34:
			case_name = "stage1LerpColorArg0";
			color_op = D3DTOP_SELECTARG1;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			stage1_color_op = D3DTOP_LERP;
			stage1_color_arg0 = D3DTA_TFACTOR | D3DTA_ALPHAREPLICATE;
			stage1_color_arg1 = D3DTA_CURRENT;
			stage1_color_arg2 = D3DTA_DIFFUSE;
			texture_factor = 0x40000000UL;
			diffuse = 0xff00ff00UL;
			stage1_color_arg0_set = true;
			stage1_color_arg1_set = true;
			stage1_color_arg2_set = true;
			expected_r = 64;
			expected_g = 191;
			expected_b = 0;
			break;
		case 35:
			case_name = "stage1SelectAlphaTextureFactor";
			color_op = D3DTOP_SELECTARG1;
			color_arg1 = D3DTA_TEXTURE;
			color_arg2 = D3DTA_DIFFUSE;
			stage1_color_op = D3DTOP_SELECTARG1;
			stage1_color_arg1 = D3DTA_CURRENT;
			stage1_alpha_op = D3DTOP_SELECTARG1;
			stage1_alpha_arg1 = D3DTA_TFACTOR;
			texture_factor = 0x40000000UL;
			stage1_color_arg1_set = true;
			stage1_alpha_op_set = true;
			stage1_alpha_arg1_set = true;
			alpha_case = true;
			expected_r = 64;
			expected_g = 0;
			expected_b = 0;
			break;
		default:
			known_case = false;
			break;
	}

	if (color_arg0_set) {
		++expected_stage_state_calls;
	}
	if (alpha_arg0_set) {
		++expected_stage_state_calls;
	}
	if (result_arg_set) {
		++expected_stage_state_calls;
	}
	if (stage1_color_arg0_set) {
		++expected_stage_state_calls;
	}
	if (stage1_color_arg1_set) {
		++expected_stage_state_calls;
	}
	if (stage1_color_arg2_set) {
		++expected_stage_state_calls;
	}
	if (stage1_alpha_op_set) {
		++expected_stage_state_calls;
	}
	if (stage1_alpha_arg0_set) {
		++expected_stage_state_calls;
	}
	if (stage1_alpha_arg1_set) {
		++expected_stage_state_calls;
	}
	if (stage1_alpha_arg2_set) {
		++expected_stage_state_calls;
	}

	if (!known_case) {
		char buffer[256];
		std::snprintf(buffer, sizeof(buffer),
			"{\"source\":\"browser_d3d8_texture_combiner_probe\",\"ok\":false,"
			"\"caseId\":%u,\"error\":\"unknown combiner case\"}",
			combiner_case);
		g_d3d8_probe_json = buffer;
		return g_d3d8_probe_json.c_str();
	}

	IDirect3D8 *d3d = Direct3DCreate8(D3D_SDK_VERSION);
	IDirect3DDevice8 *device = nullptr;
	IDirect3DTexture8 *texture = nullptr;
	IDirect3DVertexBuffer8 *vertex_buffer = nullptr;
	IDirect3DIndexBuffer8 *index_buffer = nullptr;
	bool ok = d3d != nullptr && sizeof(TexturedQuadVertex) == 44;
	HRESULT create_result = E_FAIL;
	HRESULT texture_create_result = E_FAIL;
	HRESULT texture_lock_result = E_FAIL;
	HRESULT texture_unlock_result = E_FAIL;
	HRESULT vertex_create_result = E_FAIL;
	HRESULT vertex_lock_result = E_FAIL;
	HRESULT vertex_unlock_result = E_FAIL;
	HRESULT index_create_result = E_FAIL;
	HRESULT index_lock_result = E_FAIL;
	HRESULT index_unlock_result = E_FAIL;
	HRESULT set_texture_result = E_FAIL;
	HRESULT set_stream_result = E_FAIL;
	HRESULT set_indices_result = E_FAIL;
	HRESULT draw_result = E_FAIL;
	UINT texture_id = 0;

	if (d3d != nullptr) {
		D3DPRESENT_PARAMETERS parameters = {};
		parameters.BackBufferWidth = 320;
		parameters.BackBufferHeight = 240;
		parameters.BackBufferFormat = D3DFMT_A8R8G8B8;
		parameters.BackBufferCount = 1;
		parameters.MultiSampleType = D3DMULTISAMPLE_NONE;
		parameters.SwapEffect = D3DSWAPEFFECT_DISCARD;
		parameters.Windowed = TRUE;
		parameters.EnableAutoDepthStencil = TRUE;
		parameters.AutoDepthStencilFormat = D3DFMT_D24S8;
		create_result = d3d->CreateDevice(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, nullptr,
			D3DCREATE_SOFTWARE_VERTEXPROCESSING, &parameters, &device);
		ok = ok && SUCCEEDED(create_result) && device != nullptr;
	}

	if (device != nullptr) {
		device->Clear(0, nullptr, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER, 0xff000000UL, 1.0f, 0);
		device->SetRenderState(D3DRS_CULLMODE, D3DCULL_NONE);
		device->SetRenderState(D3DRS_ZENABLE, D3DZB_FALSE);
		device->SetRenderState(D3DRS_ZWRITEENABLE, FALSE);
		device->SetRenderState(D3DRS_ALPHABLENDENABLE, alpha_case ? TRUE : FALSE);
		if (alpha_case) {
			device->SetRenderState(D3DRS_SRCBLEND, D3DBLEND_SRCALPHA);
			device->SetRenderState(D3DRS_DESTBLEND, D3DBLEND_INVSRCALPHA);
			device->SetRenderState(D3DRS_BLENDOP, D3DBLENDOP_ADD);
		}
		device->SetRenderState(D3DRS_COLORWRITEENABLE,
			D3DCOLORWRITEENABLE_RED | D3DCOLORWRITEENABLE_GREEN |
				D3DCOLORWRITEENABLE_BLUE | D3DCOLORWRITEENABLE_ALPHA);
		device->SetRenderState(D3DRS_TEXTUREFACTOR, texture_factor);
		texture_create_result = device->CreateTexture(2, 2, 1, 0,
			D3DFMT_A8R8G8B8, D3DPOOL_MANAGED, &texture);
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		texture_id = state != nullptr ? state->last_browser_texture_id : 0;
		ok = ok && SUCCEEDED(texture_create_result) && texture != nullptr && texture_id != 0;
	}

	if (texture != nullptr) {
		D3DLOCKED_RECT locked_rect = {};
		texture_lock_result = texture->LockRect(0, &locked_rect, nullptr, 0);
		if (SUCCEEDED(texture_lock_result) && locked_rect.pBits != nullptr) {
			for (UINT y = 0; y < 2; ++y) {
				BYTE *row = static_cast<BYTE *>(locked_rect.pBits) +
					static_cast<std::size_t>(locked_rect.Pitch) * y;
				for (UINT x = 0; x < 2; ++x) {
					BYTE *pixel = row + x * 4;
					pixel[0] = texture_blue;
					pixel[1] = texture_green;
					pixel[2] = texture_red;
					pixel[3] = texture_alpha;
				}
			}
		}
		texture_unlock_result = texture->UnlockRect(0);
		ok = ok && SUCCEEDED(texture_lock_result) && SUCCEEDED(texture_unlock_result);
	}

	const TexturedQuadVertex vertices[4] = {
		{ -0.75f, -0.75f, 0.0f, 0.0f, 0.0f, 1.0f, diffuse, 0.0f, 0.0f, 0.0f, 0.0f },
		{  0.75f, -0.75f, 0.0f, 0.0f, 0.0f, 1.0f, diffuse, 1.0f, 0.0f, 1.0f, 0.0f },
		{  0.75f,  0.75f, 0.0f, 0.0f, 0.0f, 1.0f, diffuse, 1.0f, 1.0f, 1.0f, 1.0f },
		{ -0.75f,  0.75f, 0.0f, 0.0f, 0.0f, 1.0f, diffuse, 0.0f, 1.0f, 0.0f, 1.0f },
	};
	const WORD indices[6] = { 0, 1, 2, 0, 2, 3 };

	if (device != nullptr) {
		vertex_create_result = device->CreateVertexBuffer(sizeof(vertices), D3DUSAGE_WRITEONLY, 0,
			D3DPOOL_MANAGED, &vertex_buffer);
		index_create_result = device->CreateIndexBuffer(sizeof(indices), D3DUSAGE_WRITEONLY,
			D3DFMT_INDEX16, D3DPOOL_MANAGED, &index_buffer);
		ok = ok && SUCCEEDED(vertex_create_result) && vertex_buffer != nullptr &&
			SUCCEEDED(index_create_result) && index_buffer != nullptr;
	}
	if (vertex_buffer != nullptr) {
		BYTE *data = nullptr;
		vertex_lock_result = vertex_buffer->Lock(0, sizeof(vertices), &data, 0);
		if (SUCCEEDED(vertex_lock_result) && data != nullptr) {
			std::memcpy(data, vertices, sizeof(vertices));
		}
		vertex_unlock_result = vertex_buffer->Unlock();
		ok = ok && SUCCEEDED(vertex_lock_result) && SUCCEEDED(vertex_unlock_result);
	}
	if (index_buffer != nullptr) {
		BYTE *data = nullptr;
		index_lock_result = index_buffer->Lock(0, sizeof(indices), &data, 0);
		if (SUCCEEDED(index_lock_result) && data != nullptr) {
			std::memcpy(data, indices, sizeof(indices));
		}
		index_unlock_result = index_buffer->Unlock();
		ok = ok && SUCCEEDED(index_lock_result) && SUCCEEDED(index_unlock_result);
	}

	if (device != nullptr && texture != nullptr && vertex_buffer != nullptr && index_buffer != nullptr) {
		device->SetTextureStageState(0, D3DTSS_COLOROP, color_op);
		if (color_arg0_set) {
			device->SetTextureStageState(0, D3DTSS_COLORARG0, color_arg0);
		}
		device->SetTextureStageState(0, D3DTSS_COLORARG1, color_arg1);
		device->SetTextureStageState(0, D3DTSS_COLORARG2, color_arg2);
		device->SetTextureStageState(0, D3DTSS_ALPHAOP, alpha_op);
		if (alpha_arg0_set) {
			device->SetTextureStageState(0, D3DTSS_ALPHAARG0, alpha_arg0);
		}
		if (result_arg_set) {
			device->SetTextureStageState(0, D3DTSS_RESULTARG, result_arg);
		}
		device->SetTextureStageState(0, D3DTSS_ALPHAARG1, alpha_arg1);
		device->SetTextureStageState(0, D3DTSS_ALPHAARG2, alpha_arg2);
		device->SetTextureStageState(0, D3DTSS_MINFILTER, D3DTEXF_POINT);
		device->SetTextureStageState(0, D3DTSS_MAGFILTER, D3DTEXF_POINT);
		device->SetTextureStageState(0, D3DTSS_MIPFILTER, D3DTEXF_NONE);
		device->SetTextureStageState(0, D3DTSS_ADDRESSU, D3DTADDRESS_CLAMP);
		device->SetTextureStageState(0, D3DTSS_ADDRESSV, D3DTADDRESS_CLAMP);
		device->SetTextureStageState(0, D3DTSS_TEXCOORDINDEX, 0);
		device->SetTextureStageState(1, D3DTSS_COLOROP, stage1_color_op);
		if (stage1_color_arg0_set) {
			device->SetTextureStageState(1, D3DTSS_COLORARG0, stage1_color_arg0);
		}
		if (stage1_color_arg1_set) {
			device->SetTextureStageState(1, D3DTSS_COLORARG1, stage1_color_arg1);
		}
		if (stage1_color_arg2_set) {
			device->SetTextureStageState(1, D3DTSS_COLORARG2, stage1_color_arg2);
		}
		if (stage1_alpha_op_set) {
			device->SetTextureStageState(1, D3DTSS_ALPHAOP, stage1_alpha_op);
		}
		if (stage1_alpha_arg0_set) {
			device->SetTextureStageState(1, D3DTSS_ALPHAARG0, stage1_alpha_arg0);
		}
		if (stage1_alpha_arg1_set) {
			device->SetTextureStageState(1, D3DTSS_ALPHAARG1, stage1_alpha_arg1);
		}
		if (stage1_alpha_arg2_set) {
			device->SetTextureStageState(1, D3DTSS_ALPHAARG2, stage1_alpha_arg2);
		}
		device->SetTextureStageState(1, D3DTSS_TEXCOORDINDEX, 1);
		set_texture_result = device->SetTexture(0, texture);
		set_stream_result = device->SetStreamSource(0, vertex_buffer, sizeof(TexturedQuadVertex));
		set_indices_result = device->SetIndices(index_buffer, 0);
		draw_result = device->DrawIndexedPrimitive(D3DPT_TRIANGLELIST, 0, 4, 0, 2);
		ok = ok && SUCCEEDED(set_texture_result) && SUCCEEDED(set_stream_result) &&
			SUCCEEDED(set_indices_result) && SUCCEEDED(draw_result);
	}

	if (index_buffer != nullptr) {
		index_buffer->Release();
	}
	if (vertex_buffer != nullptr) {
		vertex_buffer->Release();
	}
	if (texture != nullptr) {
		texture->Release();
	}
	if (device != nullptr) {
		device->Release();
	}
	if (d3d != nullptr) {
		d3d->Release();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	ok = ok &&
		state != nullptr &&
		state->direct3d_create_calls == 1 &&
		state->create_device_calls == 1 &&
		state->create_texture_calls == 1 &&
		state->browser_texture_create_calls == 1 &&
		state->browser_texture_update_calls == 1 &&
		state->browser_texture_bind_calls == 1 &&
		state->browser_texture_release_calls == 1 &&
		state->browser_buffer_create_calls == 2 &&
		state->browser_buffer_update_calls == 2 &&
		state->browser_buffer_release_calls == 2 &&
		state->set_texture_calls == 1 &&
		state->set_texture_stage_state_calls == expected_stage_state_calls &&
		state->draw_indexed_primitive_calls == 1 &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_COLOROP] == color_op &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_COLORARG0] == color_arg0 &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_COLORARG1] == color_arg1 &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_COLORARG2] == color_arg2 &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_RESULTARG] == result_arg &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_ALPHAOP] == alpha_op &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_ALPHAARG0] == alpha_arg0 &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_ALPHAARG1] == alpha_arg1 &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_ALPHAARG2] == alpha_arg2 &&
		state->last_draw_render_state.texture_factor == texture_factor &&
		state->last_draw_render_state.texture_stages[1].values[D3DTSS_COLOROP] == stage1_color_op &&
		state->last_draw_render_state.texture_stages[1].values[D3DTSS_COLORARG0] == stage1_color_arg0 &&
		state->last_draw_render_state.texture_stages[1].values[D3DTSS_COLORARG1] == stage1_color_arg1 &&
		state->last_draw_render_state.texture_stages[1].values[D3DTSS_COLORARG2] == stage1_color_arg2 &&
		state->last_draw_render_state.texture_stages[1].values[D3DTSS_ALPHAOP] == stage1_alpha_op &&
		state->last_draw_render_state.texture_stages[1].values[D3DTSS_ALPHAARG0] == stage1_alpha_arg0 &&
		state->last_draw_render_state.texture_stages[1].values[D3DTSS_ALPHAARG1] == stage1_alpha_arg1 &&
		state->last_draw_render_state.texture_stages[1].values[D3DTSS_ALPHAARG2] == stage1_alpha_arg2;

	char buffer[8192];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"browser_d3d8_texture_combiner_probe\","
		"\"ok\":%s,\"caseId\":%u,\"caseName\":\"%s\","
		"\"texture\":{\"id\":%u,\"format\":%u},"
		"\"expectedCenter\":[%u,%u,%u,%u],"
		"\"alphaCase\":%s,\"textureFactor\":%lu,\"expectedStageStateCalls\":%u,"
		"\"combiner\":{\"colorOp\":%lu,\"colorArg0\":%lu,\"colorArg1\":%lu,\"colorArg2\":%lu,"
		"\"resultArg\":%lu,"
		"\"alphaOp\":%lu,\"alphaArg0\":%lu,\"alphaArg1\":%lu,\"alphaArg2\":%lu},"
		"\"stage1Combiner\":{\"colorOp\":%lu,\"colorArg0\":%lu,\"colorArg1\":%lu,\"colorArg2\":%lu,"
		"\"alphaOp\":%lu,\"alphaArg0\":%lu,\"alphaArg1\":%lu,\"alphaArg2\":%lu},"
		"\"calls\":{\"direct3DCreate\":%u,\"createDevice\":%u,\"createTexture\":%u,"
		"\"browserTextureUpdate\":%u,\"browserTextureBind\":%u,\"browserTextureRelease\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,\"browserBufferRelease\":%u,"
		"\"setTexture\":%u,\"setTextureStageState\":%u,\"drawIndexed\":%u},"
		"\"results\":{\"create\":%ld,\"textureCreate\":%ld,\"textureLock\":%ld,"
		"\"textureUnlock\":%ld,\"vertexCreate\":%ld,\"vertexLock\":%ld,"
		"\"vertexUnlock\":%ld,\"indexCreate\":%ld,\"indexLock\":%ld,"
		"\"indexUnlock\":%ld,\"setTexture\":%ld,\"setStream\":%ld,"
		"\"setIndices\":%ld,\"draw\":%ld}}",
		ok ? "true" : "false",
		combiner_case,
		case_name,
		texture_id,
		static_cast<unsigned int>(D3DFMT_A8R8G8B8),
		expected_r,
		expected_g,
		expected_b,
		expected_a,
		alpha_case ? "true" : "false",
		static_cast<unsigned long>(texture_factor),
		expected_stage_state_calls,
		static_cast<unsigned long>(color_op),
		static_cast<unsigned long>(color_arg0),
		static_cast<unsigned long>(color_arg1),
		static_cast<unsigned long>(color_arg2),
		static_cast<unsigned long>(result_arg),
		static_cast<unsigned long>(alpha_op),
		static_cast<unsigned long>(alpha_arg0),
		static_cast<unsigned long>(alpha_arg1),
		static_cast<unsigned long>(alpha_arg2),
		static_cast<unsigned long>(stage1_color_op),
		static_cast<unsigned long>(stage1_color_arg0),
		static_cast<unsigned long>(stage1_color_arg1),
		static_cast<unsigned long>(stage1_color_arg2),
		static_cast<unsigned long>(stage1_alpha_op),
		static_cast<unsigned long>(stage1_alpha_arg0),
		static_cast<unsigned long>(stage1_alpha_arg1),
		static_cast<unsigned long>(stage1_alpha_arg2),
		state != nullptr ? state->direct3d_create_calls : 0,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		static_cast<long>(create_result),
		static_cast<long>(texture_create_result),
		static_cast<long>(texture_lock_result),
		static_cast<long>(texture_unlock_result),
		static_cast<long>(vertex_create_result),
		static_cast<long>(vertex_lock_result),
		static_cast<long>(vertex_unlock_result),
		static_cast<long>(index_create_result),
		static_cast<long>(index_lock_result),
		static_cast<long>(index_unlock_result),
		static_cast<long>(set_texture_result),
		static_cast<long>(set_stream_result),
		static_cast<long>(set_indices_result),
		static_cast<long>(draw_result));
	g_d3d8_probe_json = buffer;
	return g_d3d8_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_d3d8_texcoord_index(unsigned int texcoord_case)
{
	wasm_d3d8_reset_state();

	struct TexturedQuadVertex
	{
		float x;
		float y;
		float z;
		float nx;
		float ny;
		float nz;
		DWORD diffuse;
		float u0;
		float v0;
		float u1;
		float v1;
	};

	const char *case_name = "unknown";
	DWORD texcoord_index = D3DTSS_TCI_PASSTHRU;
	unsigned int expected_r = 255;
	unsigned int expected_g = 0;
	unsigned int expected_b = 0;
	unsigned int expected_a = 255;
	bool known_case = true;
	switch (texcoord_case) {
		case 0:
			case_name = "uv0";
			texcoord_index = D3DTSS_TCI_PASSTHRU | 0;
			break;
		case 1:
			case_name = "uv1";
			texcoord_index = D3DTSS_TCI_PASSTHRU | 1;
			expected_r = 0;
			expected_b = 255;
			break;
		default:
			known_case = false;
			break;
	}

	if (!known_case) {
		char buffer[256];
		std::snprintf(buffer, sizeof(buffer),
			"{\"source\":\"browser_d3d8_texcoord_index_probe\",\"ok\":false,"
			"\"caseId\":%u,\"error\":\"unknown texcoord case\"}",
			texcoord_case);
		g_d3d8_probe_json = buffer;
		return g_d3d8_probe_json.c_str();
	}

	IDirect3D8 *d3d = Direct3DCreate8(D3D_SDK_VERSION);
	IDirect3DDevice8 *device = nullptr;
	IDirect3DTexture8 *texture = nullptr;
	IDirect3DVertexBuffer8 *vertex_buffer = nullptr;
	IDirect3DIndexBuffer8 *index_buffer = nullptr;
	bool ok = d3d != nullptr && sizeof(TexturedQuadVertex) == 44;
	HRESULT create_result = E_FAIL;
	HRESULT texture_create_result = E_FAIL;
	HRESULT texture_lock_result = E_FAIL;
	HRESULT texture_unlock_result = E_FAIL;
	HRESULT vertex_create_result = E_FAIL;
	HRESULT vertex_lock_result = E_FAIL;
	HRESULT vertex_unlock_result = E_FAIL;
	HRESULT index_create_result = E_FAIL;
	HRESULT index_lock_result = E_FAIL;
	HRESULT index_unlock_result = E_FAIL;
	HRESULT set_texture_result = E_FAIL;
	HRESULT set_stream_result = E_FAIL;
	HRESULT set_indices_result = E_FAIL;
	HRESULT draw_result = E_FAIL;
	UINT texture_id = 0;
	UINT texture_stage_write_count = 0;

	if (d3d != nullptr) {
		D3DPRESENT_PARAMETERS parameters = {};
		parameters.BackBufferWidth = 320;
		parameters.BackBufferHeight = 240;
		parameters.BackBufferFormat = D3DFMT_A8R8G8B8;
		parameters.BackBufferCount = 1;
		parameters.MultiSampleType = D3DMULTISAMPLE_NONE;
		parameters.SwapEffect = D3DSWAPEFFECT_DISCARD;
		parameters.Windowed = TRUE;
		parameters.EnableAutoDepthStencil = TRUE;
		parameters.AutoDepthStencilFormat = D3DFMT_D24S8;
		create_result = d3d->CreateDevice(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, nullptr,
			D3DCREATE_SOFTWARE_VERTEXPROCESSING, &parameters, &device);
		ok = ok && SUCCEEDED(create_result) && device != nullptr;
	}

	if (device != nullptr) {
		device->Clear(0, nullptr, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER, 0xff000000UL, 1.0f, 0);
		device->SetRenderState(D3DRS_CULLMODE, D3DCULL_NONE);
		device->SetRenderState(D3DRS_ZENABLE, D3DZB_FALSE);
		device->SetRenderState(D3DRS_ZWRITEENABLE, FALSE);
		device->SetRenderState(D3DRS_ALPHABLENDENABLE, FALSE);
		device->SetRenderState(D3DRS_COLORWRITEENABLE,
			D3DCOLORWRITEENABLE_RED | D3DCOLORWRITEENABLE_GREEN |
				D3DCOLORWRITEENABLE_BLUE | D3DCOLORWRITEENABLE_ALPHA);
		texture_create_result = device->CreateTexture(2, 2, 1, 0,
			D3DFMT_A8R8G8B8, D3DPOOL_MANAGED, &texture);
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		texture_id = state != nullptr ? state->last_browser_texture_id : 0;
		ok = ok && SUCCEEDED(texture_create_result) && texture != nullptr && texture_id != 0;
	}

	if (texture != nullptr) {
		D3DLOCKED_RECT locked_rect = {};
		texture_lock_result = texture->LockRect(0, &locked_rect, nullptr, 0);
		if (SUCCEEDED(texture_lock_result) && locked_rect.pBits != nullptr) {
			for (UINT y = 0; y < 2; ++y) {
				BYTE *row = static_cast<BYTE *>(locked_rect.pBits) +
					static_cast<std::size_t>(locked_rect.Pitch) * y;
				for (UINT x = 0; x < 2; ++x) {
					BYTE *pixel = row + x * 4;
					pixel[0] = x == 0 ? 0x00 : 0xff;
					pixel[1] = 0x00;
					pixel[2] = x == 0 ? 0xff : 0x00;
					pixel[3] = 0xff;
				}
			}
		}
		texture_unlock_result = texture->UnlockRect(0);
		ok = ok && SUCCEEDED(texture_lock_result) && SUCCEEDED(texture_unlock_result);
	}

	const TexturedQuadVertex vertices[4] = {
		{ -0.75f, -0.75f, 0.0f, 0.0f, 0.0f, 1.0f, 0xffffffffUL, 0.25f, 0.5f, 0.75f, 0.5f },
		{  0.75f, -0.75f, 0.0f, 0.0f, 0.0f, 1.0f, 0xffffffffUL, 0.25f, 0.5f, 0.75f, 0.5f },
		{  0.75f,  0.75f, 0.0f, 0.0f, 0.0f, 1.0f, 0xffffffffUL, 0.25f, 0.5f, 0.75f, 0.5f },
		{ -0.75f,  0.75f, 0.0f, 0.0f, 0.0f, 1.0f, 0xffffffffUL, 0.25f, 0.5f, 0.75f, 0.5f },
	};
	const WORD indices[6] = { 0, 1, 2, 0, 2, 3 };

	if (device != nullptr) {
		vertex_create_result = device->CreateVertexBuffer(sizeof(vertices), D3DUSAGE_WRITEONLY, 0,
			D3DPOOL_MANAGED, &vertex_buffer);
		index_create_result = device->CreateIndexBuffer(sizeof(indices), D3DUSAGE_WRITEONLY,
			D3DFMT_INDEX16, D3DPOOL_MANAGED, &index_buffer);
		ok = ok && SUCCEEDED(vertex_create_result) && vertex_buffer != nullptr &&
			SUCCEEDED(index_create_result) && index_buffer != nullptr;
	}
	if (vertex_buffer != nullptr) {
		BYTE *data = nullptr;
		vertex_lock_result = vertex_buffer->Lock(0, sizeof(vertices), &data, 0);
		if (SUCCEEDED(vertex_lock_result) && data != nullptr) {
			std::memcpy(data, vertices, sizeof(vertices));
		}
		vertex_unlock_result = vertex_buffer->Unlock();
		ok = ok && SUCCEEDED(vertex_lock_result) && SUCCEEDED(vertex_unlock_result);
	}
	if (index_buffer != nullptr) {
		BYTE *data = nullptr;
		index_lock_result = index_buffer->Lock(0, sizeof(indices), &data, 0);
		if (SUCCEEDED(index_lock_result) && data != nullptr) {
			std::memcpy(data, indices, sizeof(indices));
		}
		index_unlock_result = index_buffer->Unlock();
		ok = ok && SUCCEEDED(index_lock_result) && SUCCEEDED(index_unlock_result);
	}

	if (device != nullptr && texture != nullptr && vertex_buffer != nullptr && index_buffer != nullptr) {
		struct TextureStageWrite
		{
			DWORD stage;
			D3DTEXTURESTAGESTATETYPE state;
			DWORD value;
		};
		const TextureStageWrite texture_stage_writes[] = {
			{ 0, D3DTSS_COLOROP, D3DTOP_SELECTARG1 },
			{ 0, D3DTSS_COLORARG1, D3DTA_TEXTURE },
			{ 0, D3DTSS_COLORARG2, D3DTA_DIFFUSE },
			{ 0, D3DTSS_MINFILTER, D3DTEXF_POINT },
			{ 0, D3DTSS_MAGFILTER, D3DTEXF_POINT },
			{ 0, D3DTSS_MIPFILTER, D3DTEXF_NONE },
			{ 0, D3DTSS_ADDRESSU, D3DTADDRESS_CLAMP },
			{ 0, D3DTSS_ADDRESSV, D3DTADDRESS_CLAMP },
			{ 0, D3DTSS_TEXCOORDINDEX, texcoord_index },
			{ 0, D3DTSS_TEXTURETRANSFORMFLAGS, D3DTTFF_DISABLE },
			{ 1, D3DTSS_COLOROP, D3DTOP_DISABLE },
			{ 1, D3DTSS_TEXCOORDINDEX, 1 },
		};
		for (UINT index = 0; index < sizeof(texture_stage_writes) / sizeof(texture_stage_writes[0]); ++index) {
			const TextureStageWrite &write = texture_stage_writes[index];
			if (SUCCEEDED(device->SetTextureStageState(write.stage, write.state, write.value))) {
				++texture_stage_write_count;
			}
		}
		set_texture_result = device->SetTexture(0, texture);
		set_stream_result = device->SetStreamSource(0, vertex_buffer, sizeof(TexturedQuadVertex));
		set_indices_result = device->SetIndices(index_buffer, 0);
		draw_result = device->DrawIndexedPrimitive(D3DPT_TRIANGLELIST, 0, 4, 0, 2);
		ok = ok && texture_stage_write_count == sizeof(texture_stage_writes) / sizeof(texture_stage_writes[0]) &&
			SUCCEEDED(set_texture_result) && SUCCEEDED(set_stream_result) &&
			SUCCEEDED(set_indices_result) && SUCCEEDED(draw_result);
	}

	if (index_buffer != nullptr) {
		index_buffer->Release();
	}
	if (vertex_buffer != nullptr) {
		vertex_buffer->Release();
	}
	if (texture != nullptr) {
		texture->Release();
	}
	if (device != nullptr) {
		device->Release();
	}
	if (d3d != nullptr) {
		d3d->Release();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	ok = ok &&
		state != nullptr &&
		state->direct3d_create_calls == 1 &&
		state->create_device_calls == 1 &&
		state->create_texture_calls == 1 &&
		state->browser_texture_create_calls == 1 &&
		state->browser_texture_update_calls == 1 &&
		state->browser_texture_bind_calls == 1 &&
		state->browser_texture_release_calls == 1 &&
		state->browser_buffer_create_calls == 2 &&
		state->browser_buffer_update_calls == 2 &&
		state->browser_buffer_release_calls == 2 &&
		state->set_texture_calls == 1 &&
		state->set_texture_stage_state_calls == texture_stage_write_count &&
		state->draw_indexed_primitive_calls == 1 &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_COLOROP] == D3DTOP_SELECTARG1 &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_COLORARG1] == D3DTA_TEXTURE &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_TEXCOORDINDEX] == texcoord_index &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_TEXTURETRANSFORMFLAGS] == D3DTTFF_DISABLE &&
		state->last_draw_render_state.texture_stages[1].values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	const unsigned int expected_set = texcoord_index & 0xffffU;
	const unsigned int expected_offset = 28U + expected_set * 8U;
	char buffer[3072];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"browser_d3d8_texcoord_index_probe\","
		"\"ok\":%s,\"caseId\":%u,\"caseName\":\"%s\","
		"\"texture\":{\"id\":%u,\"format\":%u},"
		"\"expectedCenter\":[%u,%u,%u,%u],"
		"\"texcoord\":{\"index\":%lu,\"set\":%u,\"expectedOffset\":%u,"
		"\"textureTransformFlags\":%lu},"
		"\"calls\":{\"direct3DCreate\":%u,\"createDevice\":%u,\"createTexture\":%u,"
		"\"browserTextureUpdate\":%u,\"browserTextureBind\":%u,\"browserTextureRelease\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,\"browserBufferRelease\":%u,"
		"\"setTexture\":%u,\"setTextureStageState\":%u,\"drawIndexed\":%u},"
		"\"results\":{\"create\":%ld,\"textureCreate\":%ld,\"textureLock\":%ld,"
		"\"textureUnlock\":%ld,\"vertexCreate\":%ld,\"vertexLock\":%ld,"
		"\"vertexUnlock\":%ld,\"indexCreate\":%ld,\"indexLock\":%ld,"
		"\"indexUnlock\":%ld,\"setTexture\":%ld,\"setStream\":%ld,"
		"\"setIndices\":%ld,\"draw\":%ld}}",
		ok ? "true" : "false",
		texcoord_case,
		case_name,
		texture_id,
		static_cast<unsigned int>(D3DFMT_A8R8G8B8),
		expected_r,
		expected_g,
		expected_b,
		expected_a,
		static_cast<unsigned long>(texcoord_index),
		expected_set,
		expected_offset,
		static_cast<unsigned long>(D3DTTFF_DISABLE),
		state != nullptr ? state->direct3d_create_calls : 0,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		static_cast<long>(create_result),
		static_cast<long>(texture_create_result),
		static_cast<long>(texture_lock_result),
		static_cast<long>(texture_unlock_result),
		static_cast<long>(vertex_create_result),
		static_cast<long>(vertex_lock_result),
		static_cast<long>(vertex_unlock_result),
		static_cast<long>(index_create_result),
		static_cast<long>(index_lock_result),
		static_cast<long>(index_unlock_result),
		static_cast<long>(set_texture_result),
		static_cast<long>(set_stream_result),
		static_cast<long>(set_indices_result),
		static_cast<long>(draw_result));
	g_d3d8_probe_json = buffer;
	return g_d3d8_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_d3d8_texture_transform(unsigned int transform_case)
{
	wasm_d3d8_reset_state();

	struct TexturedQuadVertex
	{
		float x;
		float y;
		float z;
		float nx;
		float ny;
		float nz;
		DWORD diffuse;
		float u0;
		float v0;
		float u1;
		float v1;
	};

	const char *case_name = "unknown";
	const char *transform_mode_name = "disable";
	DWORD texture_transform_flags = D3DTTFF_DISABLE;
	float expected_translation_u = 0.0f;
	unsigned int expected_r = 255;
	unsigned int expected_g = 0;
	unsigned int expected_b = 0;
	unsigned int expected_a = 255;
	bool transform_applied = false;
	bool known_case = true;
	switch (transform_case) {
		case 0:
			case_name = "disable";
			break;
		case 1:
			case_name = "count2TranslateU";
			transform_mode_name = "count2";
			texture_transform_flags = D3DTTFF_COUNT2;
			expected_translation_u = 0.5f;
			expected_r = 0;
			expected_b = 255;
			transform_applied = true;
			break;
		default:
			known_case = false;
			break;
	}

	if (!known_case) {
		char buffer[256];
		std::snprintf(buffer, sizeof(buffer),
			"{\"source\":\"browser_d3d8_texture_transform_probe\",\"ok\":false,"
			"\"caseId\":%u,\"error\":\"unknown texture transform case\"}",
			transform_case);
		g_d3d8_probe_json = buffer;
		return g_d3d8_probe_json.c_str();
	}

	IDirect3D8 *d3d = Direct3DCreate8(D3D_SDK_VERSION);
	IDirect3DDevice8 *device = nullptr;
	IDirect3DTexture8 *texture = nullptr;
	IDirect3DVertexBuffer8 *vertex_buffer = nullptr;
	IDirect3DIndexBuffer8 *index_buffer = nullptr;
	bool ok = d3d != nullptr && sizeof(TexturedQuadVertex) == 44;
	HRESULT create_result = E_FAIL;
	HRESULT texture_create_result = E_FAIL;
	HRESULT texture_lock_result = E_FAIL;
	HRESULT texture_unlock_result = E_FAIL;
	HRESULT vertex_create_result = E_FAIL;
	HRESULT vertex_lock_result = E_FAIL;
	HRESULT vertex_unlock_result = E_FAIL;
	HRESULT index_create_result = E_FAIL;
	HRESULT index_lock_result = E_FAIL;
	HRESULT index_unlock_result = E_FAIL;
	HRESULT set_transform_result = S_OK;
	HRESULT set_texture_result = E_FAIL;
	HRESULT set_stream_result = E_FAIL;
	HRESULT set_indices_result = E_FAIL;
	HRESULT draw_result = E_FAIL;
	UINT texture_id = 0;
	UINT texture_stage_write_count = 0;

	if (d3d != nullptr) {
		D3DPRESENT_PARAMETERS parameters = {};
		parameters.BackBufferWidth = 320;
		parameters.BackBufferHeight = 240;
		parameters.BackBufferFormat = D3DFMT_A8R8G8B8;
		parameters.BackBufferCount = 1;
		parameters.MultiSampleType = D3DMULTISAMPLE_NONE;
		parameters.SwapEffect = D3DSWAPEFFECT_DISCARD;
		parameters.Windowed = TRUE;
		parameters.EnableAutoDepthStencil = TRUE;
		parameters.AutoDepthStencilFormat = D3DFMT_D24S8;
		create_result = d3d->CreateDevice(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, nullptr,
			D3DCREATE_SOFTWARE_VERTEXPROCESSING, &parameters, &device);
		ok = ok && SUCCEEDED(create_result) && device != nullptr;
	}

	if (device != nullptr) {
		device->Clear(0, nullptr, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER, 0xff000000UL, 1.0f, 0);
		device->SetRenderState(D3DRS_CULLMODE, D3DCULL_NONE);
		device->SetRenderState(D3DRS_ZENABLE, D3DZB_FALSE);
		device->SetRenderState(D3DRS_ZWRITEENABLE, FALSE);
		device->SetRenderState(D3DRS_ALPHABLENDENABLE, FALSE);
		device->SetRenderState(D3DRS_COLORWRITEENABLE,
			D3DCOLORWRITEENABLE_RED | D3DCOLORWRITEENABLE_GREEN |
				D3DCOLORWRITEENABLE_BLUE | D3DCOLORWRITEENABLE_ALPHA);
		texture_create_result = device->CreateTexture(2, 2, 1, 0,
			D3DFMT_A8R8G8B8, D3DPOOL_MANAGED, &texture);
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		texture_id = state != nullptr ? state->last_browser_texture_id : 0;
		ok = ok && SUCCEEDED(texture_create_result) && texture != nullptr && texture_id != 0;
	}

	if (texture != nullptr) {
		D3DLOCKED_RECT locked_rect = {};
		texture_lock_result = texture->LockRect(0, &locked_rect, nullptr, 0);
		if (SUCCEEDED(texture_lock_result) && locked_rect.pBits != nullptr) {
			for (UINT y = 0; y < 2; ++y) {
				BYTE *row = static_cast<BYTE *>(locked_rect.pBits) +
					static_cast<std::size_t>(locked_rect.Pitch) * y;
				for (UINT x = 0; x < 2; ++x) {
					BYTE *pixel = row + x * 4;
					pixel[0] = x == 0 ? 0x00 : 0xff;
					pixel[1] = 0x00;
					pixel[2] = x == 0 ? 0xff : 0x00;
					pixel[3] = 0xff;
				}
			}
		}
		texture_unlock_result = texture->UnlockRect(0);
		ok = ok && SUCCEEDED(texture_lock_result) && SUCCEEDED(texture_unlock_result);
	}

	const TexturedQuadVertex vertices[4] = {
		{ -0.75f, -0.75f, 0.0f, 0.0f, 0.0f, 1.0f, 0xffffffffUL, 0.25f, 0.5f, 0.25f, 0.5f },
		{  0.75f, -0.75f, 0.0f, 0.0f, 0.0f, 1.0f, 0xffffffffUL, 0.25f, 0.5f, 0.25f, 0.5f },
		{  0.75f,  0.75f, 0.0f, 0.0f, 0.0f, 1.0f, 0xffffffffUL, 0.25f, 0.5f, 0.25f, 0.5f },
		{ -0.75f,  0.75f, 0.0f, 0.0f, 0.0f, 1.0f, 0xffffffffUL, 0.25f, 0.5f, 0.25f, 0.5f },
	};
	const WORD indices[6] = { 0, 1, 2, 0, 2, 3 };

	if (device != nullptr) {
		vertex_create_result = device->CreateVertexBuffer(sizeof(vertices), D3DUSAGE_WRITEONLY, 0,
			D3DPOOL_MANAGED, &vertex_buffer);
		index_create_result = device->CreateIndexBuffer(sizeof(indices), D3DUSAGE_WRITEONLY,
			D3DFMT_INDEX16, D3DPOOL_MANAGED, &index_buffer);
		ok = ok && SUCCEEDED(vertex_create_result) && vertex_buffer != nullptr &&
			SUCCEEDED(index_create_result) && index_buffer != nullptr;
	}
	if (vertex_buffer != nullptr) {
		BYTE *data = nullptr;
		vertex_lock_result = vertex_buffer->Lock(0, sizeof(vertices), &data, 0);
		if (SUCCEEDED(vertex_lock_result) && data != nullptr) {
			std::memcpy(data, vertices, sizeof(vertices));
		}
		vertex_unlock_result = vertex_buffer->Unlock();
		ok = ok && SUCCEEDED(vertex_lock_result) && SUCCEEDED(vertex_unlock_result);
	}
	if (index_buffer != nullptr) {
		BYTE *data = nullptr;
		index_lock_result = index_buffer->Lock(0, sizeof(indices), &data, 0);
		if (SUCCEEDED(index_lock_result) && data != nullptr) {
			std::memcpy(data, indices, sizeof(indices));
		}
		index_unlock_result = index_buffer->Unlock();
		ok = ok && SUCCEEDED(index_lock_result) && SUCCEEDED(index_unlock_result);
	}

	if (device != nullptr && texture != nullptr && vertex_buffer != nullptr && index_buffer != nullptr) {
		struct TextureStageWrite
		{
			DWORD stage;
			D3DTEXTURESTAGESTATETYPE state;
			DWORD value;
		};
		const TextureStageWrite texture_stage_writes[] = {
			{ 0, D3DTSS_COLOROP, D3DTOP_SELECTARG1 },
			{ 0, D3DTSS_COLORARG1, D3DTA_TEXTURE },
			{ 0, D3DTSS_COLORARG2, D3DTA_DIFFUSE },
			{ 0, D3DTSS_MINFILTER, D3DTEXF_POINT },
			{ 0, D3DTSS_MAGFILTER, D3DTEXF_POINT },
			{ 0, D3DTSS_MIPFILTER, D3DTEXF_NONE },
			{ 0, D3DTSS_ADDRESSU, D3DTADDRESS_CLAMP },
			{ 0, D3DTSS_ADDRESSV, D3DTADDRESS_CLAMP },
			{ 0, D3DTSS_TEXCOORDINDEX, D3DTSS_TCI_PASSTHRU | 0 },
			{ 0, D3DTSS_TEXTURETRANSFORMFLAGS, texture_transform_flags },
			{ 1, D3DTSS_COLOROP, D3DTOP_DISABLE },
			{ 1, D3DTSS_TEXCOORDINDEX, 1 },
		};
		for (UINT index = 0; index < sizeof(texture_stage_writes) / sizeof(texture_stage_writes[0]); ++index) {
			const TextureStageWrite &write = texture_stage_writes[index];
			if (SUCCEEDED(device->SetTextureStageState(write.stage, write.state, write.value))) {
				++texture_stage_write_count;
			}
		}
		if (transform_applied) {
			D3DMATRIX texture_transform = {};
			for (UINT index = 0; index < 4; ++index) {
				texture_transform.m[index][index] = 1.0f;
			}
			texture_transform.m[3][0] = expected_translation_u;
			set_transform_result = device->SetTransform(D3DTS_TEXTURE0, &texture_transform);
		}
		set_texture_result = device->SetTexture(0, texture);
		set_stream_result = device->SetStreamSource(0, vertex_buffer, sizeof(TexturedQuadVertex));
		set_indices_result = device->SetIndices(index_buffer, 0);
		draw_result = device->DrawIndexedPrimitive(D3DPT_TRIANGLELIST, 0, 4, 0, 2);
		ok = ok && texture_stage_write_count == sizeof(texture_stage_writes) / sizeof(texture_stage_writes[0]) &&
			SUCCEEDED(set_transform_result) && SUCCEEDED(set_texture_result) &&
			SUCCEEDED(set_stream_result) && SUCCEEDED(set_indices_result) && SUCCEEDED(draw_result);
	}

	if (index_buffer != nullptr) {
		index_buffer->Release();
	}
	if (vertex_buffer != nullptr) {
		vertex_buffer->Release();
	}
	if (texture != nullptr) {
		texture->Release();
	}
	if (device != nullptr) {
		device->Release();
	}
	if (d3d != nullptr) {
		d3d->Release();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const UINT expected_transform_mask = transform_applied ? 1U : 0U;
	ok = ok &&
		state != nullptr &&
		state->direct3d_create_calls == 1 &&
		state->create_device_calls == 1 &&
		state->create_texture_calls == 1 &&
		state->browser_texture_create_calls == 1 &&
		state->browser_texture_update_calls == 1 &&
		state->browser_texture_bind_calls == 1 &&
		state->browser_texture_release_calls == 1 &&
		state->browser_buffer_create_calls == 2 &&
		state->browser_buffer_update_calls == 2 &&
		state->browser_buffer_release_calls == 2 &&
		state->set_transform_calls == expected_transform_mask &&
		state->set_texture_calls == 1 &&
		state->set_texture_stage_state_calls == texture_stage_write_count &&
		state->draw_indexed_primitive_calls == 1 &&
		state->last_draw_texture_transform_mask == expected_transform_mask &&
		state->last_draw_texture0_transform.m[3][0] == expected_translation_u &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_COLOROP] == D3DTOP_SELECTARG1 &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_COLORARG1] == D3DTA_TEXTURE &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_TEXCOORDINDEX] == 0 &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_TEXTURETRANSFORMFLAGS] ==
			texture_transform_flags &&
		state->last_draw_render_state.texture_stages[1].values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	char buffer[4096];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"browser_d3d8_texture_transform_probe\","
		"\"ok\":%s,\"caseId\":%u,\"caseName\":\"%s\","
		"\"texture\":{\"id\":%u,\"format\":%u},"
		"\"expectedCenter\":[%u,%u,%u,%u],"
		"\"texcoord\":{\"index\":0,\"set\":0,\"expectedOffset\":28,"
		"\"textureTransformFlags\":%lu},"
		"\"transform\":{\"modeName\":\"%s\",\"mask\":%u,\"expectedMask\":%u,"
		"\"translationU\":%.3f,\"expectedTranslationU\":%.3f,\"applied\":%s},"
		"\"calls\":{\"direct3DCreate\":%u,\"createDevice\":%u,\"createTexture\":%u,"
		"\"browserTextureUpdate\":%u,\"browserTextureBind\":%u,\"browserTextureRelease\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,\"browserBufferRelease\":%u,"
		"\"setTransform\":%u,\"setTexture\":%u,\"setTextureStageState\":%u,\"drawIndexed\":%u},"
		"\"results\":{\"create\":%ld,\"textureCreate\":%ld,\"textureLock\":%ld,"
		"\"textureUnlock\":%ld,\"vertexCreate\":%ld,\"vertexLock\":%ld,"
		"\"vertexUnlock\":%ld,\"indexCreate\":%ld,\"indexLock\":%ld,"
		"\"indexUnlock\":%ld,\"setTransform\":%ld,\"setTexture\":%ld,"
		"\"setStream\":%ld,\"setIndices\":%ld,\"draw\":%ld}}",
		ok ? "true" : "false",
		transform_case,
		case_name,
		texture_id,
		static_cast<unsigned int>(D3DFMT_A8R8G8B8),
		expected_r,
		expected_g,
		expected_b,
		expected_a,
		static_cast<unsigned long>(texture_transform_flags),
		transform_mode_name,
		state != nullptr ? state->last_draw_texture_transform_mask : 0,
		expected_transform_mask,
		state != nullptr ? static_cast<double>(state->last_draw_texture0_transform.m[3][0]) : 0.0,
		static_cast<double>(expected_translation_u),
		transform_applied ? "true" : "false",
		state != nullptr ? state->direct3d_create_calls : 0,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		static_cast<long>(create_result),
		static_cast<long>(texture_create_result),
		static_cast<long>(texture_lock_result),
		static_cast<long>(texture_unlock_result),
		static_cast<long>(vertex_create_result),
		static_cast<long>(vertex_lock_result),
		static_cast<long>(vertex_unlock_result),
		static_cast<long>(index_create_result),
		static_cast<long>(index_lock_result),
		static_cast<long>(index_unlock_result),
		static_cast<long>(set_transform_result),
		static_cast<long>(set_texture_result),
		static_cast<long>(set_stream_result),
		static_cast<long>(set_indices_result),
		static_cast<long>(draw_result));
	g_d3d8_probe_json = buffer;
	return g_d3d8_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_d3d8_legacy_texture_upload()
{
	wasm_d3d8_reset_state();

	IDirect3D8 *d3d = Direct3DCreate8(D3D_SDK_VERSION);
	IDirect3DDevice8 *device = nullptr;
	bool ok = d3d != nullptr;
	HRESULT create_result = E_FAIL;

	if (d3d != nullptr) {
		D3DPRESENT_PARAMETERS parameters = {};
		parameters.BackBufferWidth = 800;
		parameters.BackBufferHeight = 600;
		parameters.BackBufferFormat = D3DFMT_A8R8G8B8;
		parameters.BackBufferCount = 1;
		parameters.MultiSampleType = D3DMULTISAMPLE_NONE;
		parameters.SwapEffect = D3DSWAPEFFECT_DISCARD;
		parameters.Windowed = TRUE;
		parameters.EnableAutoDepthStencil = TRUE;
		parameters.AutoDepthStencilFormat = D3DFMT_D24S8;

		create_result = d3d->CreateDevice(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, nullptr,
			D3DCREATE_SOFTWARE_VERTEXPROCESSING, &parameters, &device);
		ok = ok && SUCCEEDED(create_result) && device != nullptr;
	}

	struct LegacyFormatProbe
	{
		D3DFORMAT format;
		const char *name;
		UINT bytes_per_pixel;
		BYTE pixel0_byte0;
		BYTE pixel0_byte1;
	};
	const LegacyFormatProbe formats[] = {
		{ D3DFMT_A8, "A8", 1, 0x40, 0x00 },
		{ D3DFMT_L8, "L8", 1, 0x55, 0x00 },
		{ D3DFMT_A8L8, "A8L8", 2, 0x33, 0x77 },
	};

	struct LegacyFormatResult
	{
		const char *name;
		DWORD d3d_format;
		HRESULT create_result;
		HRESULT lock_result;
		HRESULT unlock_result;
		UINT texture_id;
		UINT width;
		UINT height;
		UINT pitch;
		UINT row_bytes;
		UINT bytes_per_pixel;
		DWORD checksum;
		int expected_sample_rgba[4];
		int expected_legacy_sample[2];
		int expected_legacy_sample_len;
	};
	LegacyFormatResult results[3] = {};

	if (device != nullptr) {
		for (int i = 0; i < 3; ++i) {
			const LegacyFormatProbe &fp = formats[i];
			LegacyFormatResult &out = results[i];
			out.name = fp.name;
			out.d3d_format = fp.format;
			out.bytes_per_pixel = fp.bytes_per_pixel;

			IDirect3DTexture8 *texture = nullptr;
			out.create_result = device->CreateTexture(2, 2, 1, 0, fp.format,
				D3DPOOL_MANAGED, &texture);
			const WasmD3D8ShimState *state = wasm_d3d8_get_state();
			out.texture_id = state != nullptr ? state->last_browser_texture_id : 0;
			ok = ok && SUCCEEDED(out.create_result) && texture != nullptr && out.texture_id != 0;

			if (texture != nullptr) {
				D3DLOCKED_RECT locked_rect = {};
				out.lock_result = texture->LockRect(0, &locked_rect, nullptr, 0);
				if (SUCCEEDED(out.lock_result) && locked_rect.pBits != nullptr) {
					std::memset(locked_rect.pBits, 0,
						static_cast<std::size_t>(locked_rect.Pitch) * 2);
					BYTE *pixel = static_cast<BYTE *>(locked_rect.pBits);
					pixel[0] = fp.pixel0_byte0;
					if (fp.bytes_per_pixel > 1) {
						pixel[1] = fp.pixel0_byte1;
					}
				}
				out.unlock_result = texture->UnlockRect(0);
				const WasmD3D8ShimState *after = wasm_d3d8_get_state();
				out.width = after != nullptr ? after->last_browser_texture_width : 0;
				out.height = after != nullptr ? after->last_browser_texture_height : 0;
				out.pitch = after != nullptr ? after->last_browser_texture_pitch : 0;
				out.row_bytes = after != nullptr ? after->last_browser_texture_row_bytes : 0;
				out.checksum = after != nullptr ? after->last_browser_texture_checksum : 0;
				ok = ok && SUCCEEDED(out.lock_result) && SUCCEEDED(out.unlock_result)
					&& out.width == 2 && out.height == 2
					&& out.pitch == 2 * fp.bytes_per_pixel
					&& out.row_bytes == 2 * fp.bytes_per_pixel;

				out.expected_sample_rgba[0] = fp.pixel0_byte0;
				out.expected_sample_rgba[1] = fp.bytes_per_pixel > 1 ? fp.pixel0_byte1 : 0;
				out.expected_sample_rgba[2] = 0;
				out.expected_sample_rgba[3] = 255;
				out.expected_legacy_sample[0] = fp.pixel0_byte0;
				out.expected_legacy_sample[1] = fp.bytes_per_pixel > 1 ? fp.pixel0_byte1 : 0;
				out.expected_legacy_sample_len = fp.bytes_per_pixel;

				texture->Release();
			}
		}
	}

	if (device != nullptr) {
		device->Release();
	}
	if (d3d != nullptr) {
		d3d->Release();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	ok = ok
		&& state != nullptr
		&& state->direct3d_create_calls == 1
		&& state->create_device_calls == 1
		&& state->create_texture_calls == 3
		&& state->texture_lock_rect_calls == 3
		&& state->texture_unlock_rect_calls == 3
		&& state->browser_texture_create_calls == 3
		&& state->browser_texture_update_calls == 3
		&& state->browser_texture_release_calls == 3;

	char buffer[2600];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"browser_d3d8_legacy_texture_upload_probe\","
		"\"ok\":%s,"
		"\"results\":{\"create\":%ld},"
		"\"calls\":{\"direct3DCreate\":%u,\"createDevice\":%u,\"createTexture\":%u,"
		"\"textureLockRect\":%u,\"textureUnlockRect\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,\"browserTextureRelease\":%u},"
		"\"formats\":["
		"{\"name\":\"%s\",\"d3dFormat\":%lu,\"create\":%ld,\"lock\":%ld,\"unlock\":%ld,"
		"\"textureId\":%u,\"width\":%u,\"height\":%u,\"pitch\":%u,\"rowBytes\":%u,"
		"\"bytesPerPixel\":%u,\"checksum\":%lu,"
		"\"expectedSampleRgba\":[%d,%d,%d,%d],"
		"\"expectedLegacySample\":[%d,%d],\"expectedLegacySampleLen\":%d},"
		"{\"name\":\"%s\",\"d3dFormat\":%lu,\"create\":%ld,\"lock\":%ld,\"unlock\":%ld,"
		"\"textureId\":%u,\"width\":%u,\"height\":%u,\"pitch\":%u,\"rowBytes\":%u,"
		"\"bytesPerPixel\":%u,\"checksum\":%lu,"
		"\"expectedSampleRgba\":[%d,%d,%d,%d],"
		"\"expectedLegacySample\":[%d,%d],\"expectedLegacySampleLen\":%d},"
		"{\"name\":\"%s\",\"d3dFormat\":%lu,\"create\":%ld,\"lock\":%ld,\"unlock\":%ld,"
		"\"textureId\":%u,\"width\":%u,\"height\":%u,\"pitch\":%u,\"rowBytes\":%u,"
		"\"bytesPerPixel\":%u,\"checksum\":%lu,"
		"\"expectedSampleRgba\":[%d,%d,%d,%d],"
		"\"expectedLegacySample\":[%d,%d],\"expectedLegacySampleLen\":%d}"
		"],"
		"\"semantics\":{"
		"\"A8\":{\"samplerRgba\":\"(0,0,0,alpha)\",\"swizzle\":\"r=ZERO,g=ZERO,b=ZERO,a=RED\"},"
		"\"L8\":{\"samplerRgba\":\"(L,L,L,1)\",\"swizzle\":\"r=RED,g=RED,b=RED,a=ONE\"},"
		"\"A8L8\":{\"samplerRgba\":\"(L,L,L,alpha)\",\"swizzle\":\"r=RED,g=RED,b=RED,a=GREEN\"}}}",
		ok ? "true" : "false",
		static_cast<long>(create_result),
		state != nullptr ? state->direct3d_create_calls : 0,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->texture_lock_rect_calls : 0,
		state != nullptr ? state->texture_unlock_rect_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		results[0].name, static_cast<unsigned long>(results[0].d3d_format),
		static_cast<long>(results[0].create_result), static_cast<long>(results[0].lock_result),
		static_cast<long>(results[0].unlock_result),
		results[0].texture_id, results[0].width, results[0].height,
		results[0].pitch, results[0].row_bytes, results[0].bytes_per_pixel,
		static_cast<unsigned long>(results[0].checksum),
		results[0].expected_sample_rgba[0], results[0].expected_sample_rgba[1],
		results[0].expected_sample_rgba[2], results[0].expected_sample_rgba[3],
		results[0].expected_legacy_sample[0], results[0].expected_legacy_sample[1],
		results[0].expected_legacy_sample_len,
		results[1].name, static_cast<unsigned long>(results[1].d3d_format),
		static_cast<long>(results[1].create_result), static_cast<long>(results[1].lock_result),
		static_cast<long>(results[1].unlock_result),
		results[1].texture_id, results[1].width, results[1].height,
		results[1].pitch, results[1].row_bytes, results[1].bytes_per_pixel,
		static_cast<unsigned long>(results[1].checksum),
		results[1].expected_sample_rgba[0], results[1].expected_sample_rgba[1],
		results[1].expected_sample_rgba[2], results[1].expected_sample_rgba[3],
		results[1].expected_legacy_sample[0], results[1].expected_legacy_sample[1],
		results[1].expected_legacy_sample_len,
		results[2].name, static_cast<unsigned long>(results[2].d3d_format),
		static_cast<long>(results[2].create_result), static_cast<long>(results[2].lock_result),
		static_cast<long>(results[2].unlock_result),
		results[2].texture_id, results[2].width, results[2].height,
		results[2].pitch, results[2].row_bytes, results[2].bytes_per_pixel,
		static_cast<unsigned long>(results[2].checksum),
		results[2].expected_sample_rgba[0], results[2].expected_sample_rgba[1],
		results[2].expected_sample_rgba[2], results[2].expected_sample_rgba[3],
		results[2].expected_legacy_sample[0], results[2].expected_legacy_sample[1],
		results[2].expected_legacy_sample_len);
	g_d3d8_probe_json = buffer;
	return g_d3d8_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_d3d8_legacy_texture_draw(unsigned int draw_case)
{
	wasm_d3d8_reset_state();

	struct TexturedQuadVertex
	{
		float x;
		float y;
		float z;
		float nx;
		float ny;
		float nz;
		DWORD diffuse;
		float u0;
		float v0;
		float u1;
		float v1;
	};

	const char *case_name = "unknown";
	const char *semantic = "unknown";
	D3DFORMAT texture_format = D3DFMT_UNKNOWN;
	UINT bytes_per_pixel = 1;
	BYTE texel_byte0 = 0;
	BYTE texel_byte1 = 0;
	DWORD diffuse = 0xffffffffUL;
	DWORD color_op = D3DTOP_SELECTARG1;
	DWORD color_arg1 = D3DTA_TEXTURE;
	DWORD color_arg2 = D3DTA_DIFFUSE;
	DWORD alpha_op = D3DTOP_SELECTARG1;
	DWORD alpha_arg1 = D3DTA_TEXTURE;
	DWORD alpha_arg2 = D3DTA_DIFFUSE;
	BOOL alpha_blend = FALSE;
	unsigned int expected_r = 255;
	unsigned int expected_g = 255;
	unsigned int expected_b = 255;
	unsigned int expected_a = 255;
	bool known_case = true;
	switch (draw_case) {
		case 0:
			case_name = "A8AlphaBlend";
			semantic = "alpha";
			texture_format = D3DFMT_A8;
			texel_byte0 = 0x80;
			color_op = D3DTOP_SELECTARG2;
			alpha_blend = TRUE;
			expected_r = 128;
			expected_g = 128;
			expected_b = 128;
			break;
		case 1:
			case_name = "L8Luminance";
			semantic = "luminance";
			texture_format = D3DFMT_L8;
			texel_byte0 = 0x66;
			alpha_blend = FALSE;
			expected_r = 102;
			expected_g = 102;
			expected_b = 102;
			break;
		case 2:
			case_name = "A8L8LuminanceAlpha";
			semantic = "luminanceAlpha";
			texture_format = D3DFMT_A8L8;
			bytes_per_pixel = 2;
			texel_byte0 = 0xff;
			texel_byte1 = 0x80;
			alpha_blend = TRUE;
			expected_r = 128;
			expected_g = 128;
			expected_b = 128;
			break;
		default:
			known_case = false;
			break;
	}

	if (!known_case) {
		char buffer[256];
		std::snprintf(buffer, sizeof(buffer),
			"{\"source\":\"browser_d3d8_legacy_texture_draw_probe\",\"ok\":false,"
			"\"caseId\":%u,\"error\":\"unknown legacy texture draw case\"}",
			draw_case);
		g_d3d8_probe_json = buffer;
		return g_d3d8_probe_json.c_str();
	}

	IDirect3D8 *d3d = Direct3DCreate8(D3D_SDK_VERSION);
	IDirect3DDevice8 *device = nullptr;
	IDirect3DTexture8 *texture = nullptr;
	IDirect3DVertexBuffer8 *vertex_buffer = nullptr;
	IDirect3DIndexBuffer8 *index_buffer = nullptr;
	bool ok = d3d != nullptr && sizeof(TexturedQuadVertex) == 44;
	HRESULT create_result = E_FAIL;
	HRESULT texture_create_result = E_FAIL;
	HRESULT texture_lock_result = E_FAIL;
	HRESULT texture_unlock_result = E_FAIL;
	HRESULT vertex_create_result = E_FAIL;
	HRESULT vertex_lock_result = E_FAIL;
	HRESULT vertex_unlock_result = E_FAIL;
	HRESULT index_create_result = E_FAIL;
	HRESULT index_lock_result = E_FAIL;
	HRESULT index_unlock_result = E_FAIL;
	HRESULT set_texture_result = E_FAIL;
	HRESULT set_stream_result = E_FAIL;
	HRESULT set_indices_result = E_FAIL;
	HRESULT draw_result = E_FAIL;
	UINT texture_id = 0;
	UINT texture_stage_write_count = 0;
	UINT upload_pitch = 0;
	UINT upload_row_bytes = 0;

	if (d3d != nullptr) {
		D3DPRESENT_PARAMETERS parameters = {};
		parameters.BackBufferWidth = 320;
		parameters.BackBufferHeight = 240;
		parameters.BackBufferFormat = D3DFMT_A8R8G8B8;
		parameters.BackBufferCount = 1;
		parameters.MultiSampleType = D3DMULTISAMPLE_NONE;
		parameters.SwapEffect = D3DSWAPEFFECT_DISCARD;
		parameters.Windowed = TRUE;
		parameters.EnableAutoDepthStencil = TRUE;
		parameters.AutoDepthStencilFormat = D3DFMT_D24S8;
		create_result = d3d->CreateDevice(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, nullptr,
			D3DCREATE_SOFTWARE_VERTEXPROCESSING, &parameters, &device);
		ok = ok && SUCCEEDED(create_result) && device != nullptr;
	}

	if (device != nullptr) {
		device->Clear(0, nullptr, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER, 0xff000000UL, 1.0f, 0);
		device->SetRenderState(D3DRS_CULLMODE, D3DCULL_NONE);
		device->SetRenderState(D3DRS_ZENABLE, D3DZB_FALSE);
		device->SetRenderState(D3DRS_ZWRITEENABLE, FALSE);
		device->SetRenderState(D3DRS_ALPHABLENDENABLE, alpha_blend);
		if (alpha_blend) {
			device->SetRenderState(D3DRS_SRCBLEND, D3DBLEND_SRCALPHA);
			device->SetRenderState(D3DRS_DESTBLEND, D3DBLEND_INVSRCALPHA);
			device->SetRenderState(D3DRS_BLENDOP, D3DBLENDOP_ADD);
		}
		device->SetRenderState(D3DRS_COLORWRITEENABLE,
			D3DCOLORWRITEENABLE_RED | D3DCOLORWRITEENABLE_GREEN |
				D3DCOLORWRITEENABLE_BLUE | D3DCOLORWRITEENABLE_ALPHA);
		texture_create_result = device->CreateTexture(2, 2, 1, 0,
			texture_format, D3DPOOL_MANAGED, &texture);
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		texture_id = state != nullptr ? state->last_browser_texture_id : 0;
		ok = ok && SUCCEEDED(texture_create_result) && texture != nullptr && texture_id != 0;
	}

	if (texture != nullptr) {
		D3DLOCKED_RECT locked_rect = {};
		texture_lock_result = texture->LockRect(0, &locked_rect, nullptr, 0);
		if (SUCCEEDED(texture_lock_result) && locked_rect.pBits != nullptr) {
			for (UINT y = 0; y < 2; ++y) {
				BYTE *row = static_cast<BYTE *>(locked_rect.pBits) +
					static_cast<std::size_t>(locked_rect.Pitch) * y;
				for (UINT x = 0; x < 2; ++x) {
					BYTE *pixel = row + x * bytes_per_pixel;
					pixel[0] = texel_byte0;
					if (bytes_per_pixel > 1) {
						pixel[1] = texel_byte1;
					}
				}
			}
		}
		texture_unlock_result = texture->UnlockRect(0);
		const WasmD3D8ShimState *after = wasm_d3d8_get_state();
		upload_pitch = after != nullptr ? after->last_browser_texture_pitch : 0;
		upload_row_bytes = after != nullptr ? after->last_browser_texture_row_bytes : 0;
		ok = ok && SUCCEEDED(texture_lock_result) && SUCCEEDED(texture_unlock_result)
			&& upload_pitch == 2 * bytes_per_pixel
			&& upload_row_bytes == 2 * bytes_per_pixel;
	}

	const TexturedQuadVertex vertices[4] = {
		{ -0.75f, -0.75f, 0.0f, 0.0f, 0.0f, 1.0f, diffuse, 0.5f, 0.5f, 0.5f, 0.5f },
		{  0.75f, -0.75f, 0.0f, 0.0f, 0.0f, 1.0f, diffuse, 0.5f, 0.5f, 0.5f, 0.5f },
		{  0.75f,  0.75f, 0.0f, 0.0f, 0.0f, 1.0f, diffuse, 0.5f, 0.5f, 0.5f, 0.5f },
		{ -0.75f,  0.75f, 0.0f, 0.0f, 0.0f, 1.0f, diffuse, 0.5f, 0.5f, 0.5f, 0.5f },
	};
	const WORD indices[6] = { 0, 1, 2, 0, 2, 3 };

	if (device != nullptr) {
		vertex_create_result = device->CreateVertexBuffer(sizeof(vertices), D3DUSAGE_WRITEONLY, 0,
			D3DPOOL_MANAGED, &vertex_buffer);
		index_create_result = device->CreateIndexBuffer(sizeof(indices), D3DUSAGE_WRITEONLY,
			D3DFMT_INDEX16, D3DPOOL_MANAGED, &index_buffer);
		ok = ok && SUCCEEDED(vertex_create_result) && vertex_buffer != nullptr &&
			SUCCEEDED(index_create_result) && index_buffer != nullptr;
	}
	if (vertex_buffer != nullptr) {
		BYTE *data = nullptr;
		vertex_lock_result = vertex_buffer->Lock(0, sizeof(vertices), &data, 0);
		if (SUCCEEDED(vertex_lock_result) && data != nullptr) {
			std::memcpy(data, vertices, sizeof(vertices));
		}
		vertex_unlock_result = vertex_buffer->Unlock();
		ok = ok && SUCCEEDED(vertex_lock_result) && SUCCEEDED(vertex_unlock_result);
	}
	if (index_buffer != nullptr) {
		BYTE *data = nullptr;
		index_lock_result = index_buffer->Lock(0, sizeof(indices), &data, 0);
		if (SUCCEEDED(index_lock_result) && data != nullptr) {
			std::memcpy(data, indices, sizeof(indices));
		}
		index_unlock_result = index_buffer->Unlock();
		ok = ok && SUCCEEDED(index_lock_result) && SUCCEEDED(index_unlock_result);
	}

	if (device != nullptr && texture != nullptr && vertex_buffer != nullptr && index_buffer != nullptr) {
		struct TextureStageWrite
		{
			DWORD stage;
			D3DTEXTURESTAGESTATETYPE state;
			DWORD value;
		};
		const TextureStageWrite texture_stage_writes[] = {
			{ 0, D3DTSS_COLOROP, color_op },
			{ 0, D3DTSS_COLORARG1, color_arg1 },
			{ 0, D3DTSS_COLORARG2, color_arg2 },
			{ 0, D3DTSS_ALPHAOP, alpha_op },
			{ 0, D3DTSS_ALPHAARG1, alpha_arg1 },
			{ 0, D3DTSS_ALPHAARG2, alpha_arg2 },
			{ 0, D3DTSS_MINFILTER, D3DTEXF_POINT },
			{ 0, D3DTSS_MAGFILTER, D3DTEXF_POINT },
			{ 0, D3DTSS_MIPFILTER, D3DTEXF_NONE },
			{ 0, D3DTSS_ADDRESSU, D3DTADDRESS_CLAMP },
			{ 0, D3DTSS_ADDRESSV, D3DTADDRESS_CLAMP },
			{ 0, D3DTSS_TEXCOORDINDEX, D3DTSS_TCI_PASSTHRU | 0 },
			{ 0, D3DTSS_TEXTURETRANSFORMFLAGS, D3DTTFF_DISABLE },
			{ 1, D3DTSS_COLOROP, D3DTOP_DISABLE },
		};
		for (UINT index = 0; index < sizeof(texture_stage_writes) / sizeof(texture_stage_writes[0]); ++index) {
			const TextureStageWrite &write = texture_stage_writes[index];
			if (SUCCEEDED(device->SetTextureStageState(write.stage, write.state, write.value))) {
				++texture_stage_write_count;
			}
		}
		set_texture_result = device->SetTexture(0, texture);
		set_stream_result = device->SetStreamSource(0, vertex_buffer, sizeof(TexturedQuadVertex));
		set_indices_result = device->SetIndices(index_buffer, 0);
		draw_result = device->DrawIndexedPrimitive(D3DPT_TRIANGLELIST, 0, 4, 0, 2);
		ok = ok && texture_stage_write_count == sizeof(texture_stage_writes) / sizeof(texture_stage_writes[0]) &&
			SUCCEEDED(set_texture_result) && SUCCEEDED(set_stream_result) &&
			SUCCEEDED(set_indices_result) && SUCCEEDED(draw_result);
	}

	if (index_buffer != nullptr) {
		index_buffer->Release();
	}
	if (vertex_buffer != nullptr) {
		vertex_buffer->Release();
	}
	if (texture != nullptr) {
		texture->Release();
	}
	if (device != nullptr) {
		device->Release();
	}
	if (d3d != nullptr) {
		d3d->Release();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	ok = ok &&
		state != nullptr &&
		state->direct3d_create_calls == 1 &&
		state->create_device_calls == 1 &&
		state->create_texture_calls == 1 &&
		state->texture_lock_rect_calls == 1 &&
		state->texture_unlock_rect_calls == 1 &&
		state->browser_texture_create_calls == 1 &&
		state->browser_texture_update_calls == 1 &&
		state->browser_texture_bind_calls == 1 &&
		state->browser_texture_release_calls == 1 &&
		state->browser_buffer_create_calls == 2 &&
		state->browser_buffer_update_calls == 2 &&
		state->browser_buffer_release_calls == 2 &&
		state->set_texture_calls == 1 &&
		state->set_texture_stage_state_calls == texture_stage_write_count &&
		state->draw_indexed_primitive_calls == 1 &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_COLOROP] == color_op &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_COLORARG1] == color_arg1 &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_COLORARG2] == color_arg2 &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_ALPHAOP] == alpha_op &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_ALPHAARG1] == alpha_arg1 &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_ALPHAARG2] == alpha_arg2 &&
		state->last_draw_render_state.texture_stages[0].values[D3DTSS_TEXTURETRANSFORMFLAGS] == D3DTTFF_DISABLE &&
		state->last_draw_render_state.texture_stages[1].values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	char buffer[4096];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"browser_d3d8_legacy_texture_draw_probe\","
		"\"ok\":%s,\"caseId\":%u,\"caseName\":\"%s\","
		"\"texture\":{\"id\":%u,\"format\":%u,\"bytesPerPixel\":%u,"
		"\"texelBytes\":[%u,%u],\"semantic\":\"%s\","
		"\"pitch\":%u,\"rowBytes\":%u},"
		"\"expectedCenter\":[%u,%u,%u,%u],"
		"\"alphaBlend\":%s,"
		"\"combiner\":{\"colorOp\":%lu,\"colorArg1\":%lu,\"colorArg2\":%lu,"
		"\"alphaOp\":%lu,\"alphaArg1\":%lu,\"alphaArg2\":%lu},"
		"\"calls\":{\"direct3DCreate\":%u,\"createDevice\":%u,\"createTexture\":%u,"
		"\"textureLockRect\":%u,\"textureUnlockRect\":%u,"
		"\"browserTextureUpdate\":%u,\"browserTextureBind\":%u,\"browserTextureRelease\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,\"browserBufferRelease\":%u,"
		"\"setTexture\":%u,\"setTextureStageState\":%u,\"drawIndexed\":%u},"
		"\"results\":{\"create\":%ld,\"textureCreate\":%ld,\"textureLock\":%ld,"
		"\"textureUnlock\":%ld,\"vertexCreate\":%ld,\"vertexLock\":%ld,"
		"\"vertexUnlock\":%ld,\"indexCreate\":%ld,\"indexLock\":%ld,"
		"\"indexUnlock\":%ld,\"setTexture\":%ld,\"setStream\":%ld,"
		"\"setIndices\":%ld,\"draw\":%ld}}",
		ok ? "true" : "false",
		draw_case,
		case_name,
		texture_id,
		static_cast<unsigned int>(texture_format),
		bytes_per_pixel,
		static_cast<unsigned int>(texel_byte0),
		static_cast<unsigned int>(texel_byte1),
		semantic,
		upload_pitch,
		upload_row_bytes,
		expected_r,
		expected_g,
		expected_b,
		expected_a,
		alpha_blend ? "true" : "false",
		static_cast<unsigned long>(color_op),
		static_cast<unsigned long>(color_arg1),
		static_cast<unsigned long>(color_arg2),
		static_cast<unsigned long>(alpha_op),
		static_cast<unsigned long>(alpha_arg1),
		static_cast<unsigned long>(alpha_arg2),
		state != nullptr ? state->direct3d_create_calls : 0,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->texture_lock_rect_calls : 0,
		state != nullptr ? state->texture_unlock_rect_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		static_cast<long>(create_result),
		static_cast<long>(texture_create_result),
		static_cast<long>(texture_lock_result),
		static_cast<long>(texture_unlock_result),
		static_cast<long>(vertex_create_result),
		static_cast<long>(vertex_lock_result),
		static_cast<long>(vertex_unlock_result),
		static_cast<long>(index_create_result),
		static_cast<long>(index_lock_result),
		static_cast<long>(index_unlock_result),
		static_cast<long>(set_texture_result),
		static_cast<long>(set_stream_result),
		static_cast<long>(set_indices_result),
		static_cast<long>(draw_result));
	g_d3d8_probe_json = buffer;
	return g_d3d8_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_d3d8_dxt_texture_draw(unsigned int draw_case)
{
	wasm_d3d8_reset_state();

	struct TexturedQuadVertex
	{
		float x;
		float y;
		float z;
		float nx;
		float ny;
		float nz;
		DWORD diffuse;
		float u0;
		float v0;
		float u1;
		float v1;
	};

	const char *case_name = "unknown";
	D3DFORMAT texture_format = D3DFMT_UNKNOWN;
	UINT block_bytes = 0;
	BOOL alpha_blend = FALSE;
	unsigned int expected_r = 255;
	unsigned int expected_g = 0;
	unsigned int expected_b = 0;
	unsigned int expected_a = 255;
	bool known_case = true;
	switch (draw_case) {
		case 0:
			case_name = "DXT1Red";
			texture_format = D3DFMT_DXT1;
			block_bytes = 8;
			break;
		case 1:
			case_name = "DXT3AlphaRed";
			texture_format = D3DFMT_DXT3;
			block_bytes = 16;
			alpha_blend = TRUE;
			expected_r = 136;
			break;
		case 2:
			case_name = "DXT5AlphaRed";
			texture_format = D3DFMT_DXT5;
			block_bytes = 16;
			alpha_blend = TRUE;
			expected_r = 128;
			break;
		case 3:
			case_name = "DXT2PremultipliedAlphaRed";
			texture_format = D3DFMT_DXT2;
			block_bytes = 16;
			alpha_blend = TRUE;
			expected_r = 136;
			break;
		case 4:
			case_name = "DXT4PremultipliedAlphaRed";
			texture_format = D3DFMT_DXT4;
			block_bytes = 16;
			alpha_blend = TRUE;
			expected_r = 128;
			break;
		default:
			known_case = false;
			break;
	}

	if (!known_case) {
		char buffer[256];
		std::snprintf(buffer, sizeof(buffer),
			"{\"source\":\"browser_d3d8_dxt_texture_draw_probe\",\"ok\":false,"
			"\"caseId\":%u,\"error\":\"unknown DXT texture draw case\"}",
			draw_case);
		g_d3d8_probe_json = buffer;
		return g_d3d8_probe_json.c_str();
	}

	IDirect3D8 *d3d = Direct3DCreate8(D3D_SDK_VERSION);
	IDirect3DDevice8 *device = nullptr;
	IDirect3DTexture8 *texture = nullptr;
	IDirect3DVertexBuffer8 *vertex_buffer = nullptr;
	IDirect3DIndexBuffer8 *index_buffer = nullptr;
	bool ok = d3d != nullptr && sizeof(TexturedQuadVertex) == 44;
	HRESULT create_result = E_FAIL;
	HRESULT texture_create_result = E_FAIL;
	HRESULT texture_lock_result = E_FAIL;
	HRESULT texture_unlock_result = E_FAIL;
	HRESULT partial_lock_result = E_FAIL;
	HRESULT vertex_create_result = E_FAIL;
	HRESULT vertex_lock_result = E_FAIL;
	HRESULT vertex_unlock_result = E_FAIL;
	HRESULT index_create_result = E_FAIL;
	HRESULT index_lock_result = E_FAIL;
	HRESULT index_unlock_result = E_FAIL;
	HRESULT set_texture_result = E_FAIL;
	HRESULT set_stream_result = E_FAIL;
	HRESULT set_indices_result = E_FAIL;
	HRESULT draw_result = E_FAIL;
	UINT texture_id = 0;
	UINT texture_stage_write_count = 0;
	UINT upload_pitch = 0;
	UINT upload_row_bytes = 0;
	UINT upload_bytes = 0;
	DWORD checksum = 0;

	if (d3d != nullptr) {
		D3DPRESENT_PARAMETERS parameters = {};
		parameters.BackBufferWidth = 320;
		parameters.BackBufferHeight = 240;
		parameters.BackBufferFormat = D3DFMT_A8R8G8B8;
		parameters.BackBufferCount = 1;
		parameters.MultiSampleType = D3DMULTISAMPLE_NONE;
		parameters.SwapEffect = D3DSWAPEFFECT_DISCARD;
		parameters.Windowed = TRUE;
		parameters.EnableAutoDepthStencil = TRUE;
		parameters.AutoDepthStencilFormat = D3DFMT_D24S8;
		create_result = d3d->CreateDevice(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, nullptr,
			D3DCREATE_SOFTWARE_VERTEXPROCESSING, &parameters, &device);
		ok = ok && SUCCEEDED(create_result) && device != nullptr;
	}

	if (device != nullptr) {
		device->Clear(0, nullptr, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER, 0xff000000UL, 1.0f, 0);
		device->SetRenderState(D3DRS_CULLMODE, D3DCULL_NONE);
		device->SetRenderState(D3DRS_ZENABLE, D3DZB_FALSE);
		device->SetRenderState(D3DRS_ZWRITEENABLE, FALSE);
		device->SetRenderState(D3DRS_ALPHABLENDENABLE, alpha_blend);
		if (alpha_blend) {
			device->SetRenderState(D3DRS_SRCBLEND, D3DBLEND_SRCALPHA);
			device->SetRenderState(D3DRS_DESTBLEND, D3DBLEND_INVSRCALPHA);
			device->SetRenderState(D3DRS_BLENDOP, D3DBLENDOP_ADD);
		}
		device->SetRenderState(D3DRS_COLORWRITEENABLE,
			D3DCOLORWRITEENABLE_RED | D3DCOLORWRITEENABLE_GREEN |
				D3DCOLORWRITEENABLE_BLUE | D3DCOLORWRITEENABLE_ALPHA);
		texture_create_result = device->CreateTexture(4, 4, 1, 0,
			texture_format, D3DPOOL_MANAGED, &texture);
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		texture_id = state != nullptr ? state->last_browser_texture_id : 0;
		ok = ok && SUCCEEDED(texture_create_result) && texture != nullptr && texture_id != 0;
	}

	if (texture != nullptr) {
		D3DSURFACE_DESC desc = {};
		ok = ok && SUCCEEDED(texture->GetLevelDesc(0, &desc)) &&
			desc.Width == 4 && desc.Height == 4 && desc.Format == texture_format &&
			desc.Size == block_bytes;

		RECT partial_rect = {};
		partial_rect.left = 0;
		partial_rect.top = 0;
		partial_rect.right = 2;
		partial_rect.bottom = 2;
		D3DLOCKED_RECT ignored_partial = {};
		partial_lock_result = texture->LockRect(0, &ignored_partial, &partial_rect, 0);
		ok = ok && FAILED(partial_lock_result);

		D3DLOCKED_RECT locked_rect = {};
		texture_lock_result = texture->LockRect(0, &locked_rect, nullptr, 0);
		if (SUCCEEDED(texture_lock_result) && locked_rect.pBits != nullptr) {
			BYTE *block = static_cast<BYTE *>(locked_rect.pBits);
			std::memset(block, 0, block_bytes);
			UINT color_offset = 0;
			if (texture_format == D3DFMT_DXT2 || texture_format == D3DFMT_DXT3) {
				for (UINT index = 0; index < 8; ++index) {
					block[index] = 0x88;
				}
				color_offset = 8;
			} else if (texture_format == D3DFMT_DXT4 || texture_format == D3DFMT_DXT5) {
				block[0] = 0x80;
				block[1] = 0x00;
				color_offset = 8;
			}
			block[color_offset + 0] = 0x00;
			block[color_offset + 1] = 0xf8;
			block[color_offset + 2] = 0x00;
			block[color_offset + 3] = 0x00;
			block[color_offset + 4] = 0x00;
			block[color_offset + 5] = 0x00;
			block[color_offset + 6] = 0x00;
			block[color_offset + 7] = 0x00;
		}
		texture_unlock_result = texture->UnlockRect(0);
		const WasmD3D8ShimState *after = wasm_d3d8_get_state();
		upload_pitch = after != nullptr ? after->last_browser_texture_pitch : 0;
		upload_row_bytes = after != nullptr ? after->last_browser_texture_row_bytes : 0;
		upload_bytes = after != nullptr ? after->last_browser_texture_bytes : 0;
		checksum = after != nullptr ? after->last_browser_texture_checksum : 0;
		ok = ok && SUCCEEDED(texture_lock_result) && SUCCEEDED(texture_unlock_result)
			&& upload_pitch == block_bytes
			&& upload_row_bytes == block_bytes
			&& upload_bytes == block_bytes;
	}

	const TexturedQuadVertex vertices[4] = {
		{ -0.75f, -0.75f, 0.0f, 0.0f, 0.0f, 1.0f, 0xffffffffUL, 0.5f, 0.5f, 0.5f, 0.5f },
		{  0.75f, -0.75f, 0.0f, 0.0f, 0.0f, 1.0f, 0xffffffffUL, 0.5f, 0.5f, 0.5f, 0.5f },
		{  0.75f,  0.75f, 0.0f, 0.0f, 0.0f, 1.0f, 0xffffffffUL, 0.5f, 0.5f, 0.5f, 0.5f },
		{ -0.75f,  0.75f, 0.0f, 0.0f, 0.0f, 1.0f, 0xffffffffUL, 0.5f, 0.5f, 0.5f, 0.5f },
	};
	const WORD indices[6] = { 0, 1, 2, 0, 2, 3 };

	if (device != nullptr) {
		vertex_create_result = device->CreateVertexBuffer(sizeof(vertices), D3DUSAGE_WRITEONLY, 0,
			D3DPOOL_MANAGED, &vertex_buffer);
		index_create_result = device->CreateIndexBuffer(sizeof(indices), D3DUSAGE_WRITEONLY,
			D3DFMT_INDEX16, D3DPOOL_MANAGED, &index_buffer);
		ok = ok && SUCCEEDED(vertex_create_result) && vertex_buffer != nullptr &&
			SUCCEEDED(index_create_result) && index_buffer != nullptr;
	}
	if (vertex_buffer != nullptr) {
		BYTE *data = nullptr;
		vertex_lock_result = vertex_buffer->Lock(0, sizeof(vertices), &data, 0);
		if (SUCCEEDED(vertex_lock_result) && data != nullptr) {
			std::memcpy(data, vertices, sizeof(vertices));
		}
		vertex_unlock_result = vertex_buffer->Unlock();
		ok = ok && SUCCEEDED(vertex_lock_result) && SUCCEEDED(vertex_unlock_result);
	}
	if (index_buffer != nullptr) {
		BYTE *data = nullptr;
		index_lock_result = index_buffer->Lock(0, sizeof(indices), &data, 0);
		if (SUCCEEDED(index_lock_result) && data != nullptr) {
			std::memcpy(data, indices, sizeof(indices));
		}
		index_unlock_result = index_buffer->Unlock();
		ok = ok && SUCCEEDED(index_lock_result) && SUCCEEDED(index_unlock_result);
	}

	if (device != nullptr && texture != nullptr && vertex_buffer != nullptr && index_buffer != nullptr) {
		struct TextureStageWrite
		{
			DWORD stage;
			D3DTEXTURESTAGESTATETYPE state;
			DWORD value;
		};
		const TextureStageWrite texture_stage_writes[] = {
			{ 0, D3DTSS_COLOROP, D3DTOP_SELECTARG1 },
			{ 0, D3DTSS_COLORARG1, D3DTA_TEXTURE },
			{ 0, D3DTSS_COLORARG2, D3DTA_DIFFUSE },
			{ 0, D3DTSS_ALPHAOP, D3DTOP_SELECTARG1 },
			{ 0, D3DTSS_ALPHAARG1, D3DTA_TEXTURE },
			{ 0, D3DTSS_ALPHAARG2, D3DTA_DIFFUSE },
			{ 0, D3DTSS_MINFILTER, D3DTEXF_POINT },
			{ 0, D3DTSS_MAGFILTER, D3DTEXF_POINT },
			{ 0, D3DTSS_MIPFILTER, D3DTEXF_NONE },
			{ 0, D3DTSS_ADDRESSU, D3DTADDRESS_CLAMP },
			{ 0, D3DTSS_ADDRESSV, D3DTADDRESS_CLAMP },
			{ 0, D3DTSS_TEXCOORDINDEX, D3DTSS_TCI_PASSTHRU | 0 },
			{ 0, D3DTSS_TEXTURETRANSFORMFLAGS, D3DTTFF_DISABLE },
			{ 1, D3DTSS_COLOROP, D3DTOP_DISABLE },
		};
		for (UINT index = 0; index < sizeof(texture_stage_writes) / sizeof(texture_stage_writes[0]); ++index) {
			const TextureStageWrite &write = texture_stage_writes[index];
			if (SUCCEEDED(device->SetTextureStageState(write.stage, write.state, write.value))) {
				++texture_stage_write_count;
			}
		}
		set_texture_result = device->SetTexture(0, texture);
		set_stream_result = device->SetStreamSource(0, vertex_buffer, sizeof(TexturedQuadVertex));
		set_indices_result = device->SetIndices(index_buffer, 0);
		draw_result = device->DrawIndexedPrimitive(D3DPT_TRIANGLELIST, 0, 4, 0, 2);
		ok = ok && texture_stage_write_count == sizeof(texture_stage_writes) / sizeof(texture_stage_writes[0]) &&
			SUCCEEDED(set_texture_result) && SUCCEEDED(set_stream_result) &&
			SUCCEEDED(set_indices_result) && SUCCEEDED(draw_result);
	}

	if (index_buffer != nullptr) {
		index_buffer->Release();
	}
	if (vertex_buffer != nullptr) {
		vertex_buffer->Release();
	}
	if (texture != nullptr) {
		texture->Release();
	}
	if (device != nullptr) {
		device->Release();
	}
	if (d3d != nullptr) {
		d3d->Release();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	ok = ok &&
		state != nullptr &&
		state->direct3d_create_calls == 1 &&
		state->create_device_calls == 1 &&
		state->create_texture_calls == 1 &&
		state->texture_lock_rect_calls == 2 &&
		state->texture_unlock_rect_calls == 1 &&
		state->browser_texture_create_calls == 1 &&
		state->browser_texture_update_calls == 1 &&
		state->browser_texture_bind_calls == 1 &&
		state->browser_texture_release_calls == 1 &&
		state->browser_buffer_create_calls == 2 &&
		state->browser_buffer_update_calls == 2 &&
		state->browser_buffer_release_calls == 2 &&
		state->set_texture_calls == 1 &&
		state->set_texture_stage_state_calls == texture_stage_write_count &&
		state->draw_indexed_primitive_calls == 1;

	char buffer[4096];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"browser_d3d8_dxt_texture_draw_probe\","
		"\"ok\":%s,\"caseId\":%u,\"caseName\":\"%s\","
		"\"texture\":{\"id\":%u,\"format\":%u,\"blockBytes\":%u,"
		"\"pitch\":%u,\"rowBytes\":%u,\"byteSize\":%u,\"checksum\":%lu},"
		"\"expectedCenter\":[%u,%u,%u,%u],"
		"\"alphaBlend\":%s,"
		"\"calls\":{\"direct3DCreate\":%u,\"createDevice\":%u,\"createTexture\":%u,"
		"\"textureLockRect\":%u,\"textureUnlockRect\":%u,"
		"\"browserTextureUpdate\":%u,\"browserTextureBind\":%u,\"browserTextureRelease\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,\"browserBufferRelease\":%u,"
		"\"setTexture\":%u,\"setTextureStageState\":%u,\"drawIndexed\":%u},"
		"\"results\":{\"create\":%ld,\"textureCreate\":%ld,\"partialLock\":%ld,"
		"\"textureLock\":%ld,\"textureUnlock\":%ld,\"vertexCreate\":%ld,"
		"\"vertexLock\":%ld,\"vertexUnlock\":%ld,\"indexCreate\":%ld,"
		"\"indexLock\":%ld,\"indexUnlock\":%ld,\"setTexture\":%ld,"
		"\"setStream\":%ld,\"setIndices\":%ld,\"draw\":%ld}}",
		ok ? "true" : "false",
		draw_case,
		case_name,
		texture_id,
		static_cast<unsigned int>(texture_format),
		block_bytes,
		upload_pitch,
		upload_row_bytes,
		upload_bytes,
		static_cast<unsigned long>(checksum),
		expected_r,
		expected_g,
		expected_b,
		expected_a,
		alpha_blend ? "true" : "false",
		state != nullptr ? state->direct3d_create_calls : 0,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->texture_lock_rect_calls : 0,
		state != nullptr ? state->texture_unlock_rect_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		static_cast<long>(create_result),
		static_cast<long>(texture_create_result),
		static_cast<long>(partial_lock_result),
		static_cast<long>(texture_lock_result),
		static_cast<long>(texture_unlock_result),
		static_cast<long>(vertex_create_result),
		static_cast<long>(vertex_lock_result),
		static_cast<long>(vertex_unlock_result),
		static_cast<long>(index_create_result),
		static_cast<long>(index_lock_result),
		static_cast<long>(index_unlock_result),
		static_cast<long>(set_texture_result),
		static_cast<long>(set_stream_result),
		static_cast<long>(set_indices_result),
		static_cast<long>(draw_result));
	g_d3d8_probe_json = buffer;
	return g_d3d8_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_state()
{
	return write_state_json();
}

}
