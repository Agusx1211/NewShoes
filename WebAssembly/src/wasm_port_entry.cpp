#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <string>

#include "wasm_archive_probe.h"
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
	char buffer[14000];
	const std::string archive_path_json = json_escape(g_archive_probe.archive_path);
	const std::string game_data_shell_map_name_json =
		json_escape(g_archive_probe.game_data_shell_map_name);
	const std::string archive_mount_directory_json = json_escape(g_archive_mount.directory);
	const std::string archive_mount_file_mask_json = json_escape(g_archive_mount.file_mask);
	const std::string global_data_source_json = json_escape(g_global_data_probe.source);
	const std::string global_data_user_data_path_json =
		json_escape(g_global_data_probe.user_data_path);
	const std::string global_data_shell_map_name_json =
		json_escape(g_global_data_probe.shell_map_name);
	const std::string command_line_source_json = json_escape(g_command_line_probe.source);
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
		"\"gameDataIni\":%s,\"weaponIni\":%s},"
		"\"gameData\":{\"attempted\":%s,\"ok\":%s,\"bytes\":%zu,"
		"\"parsedFields\":%zu,\"shellMapName\":\"%s\","
		"\"useFpsLimit\":%s,\"framesPerSecondLimit\":%d,"
		"\"maxShellScreens\":%d,\"useCloudMap\":%s,"
		"\"defaultStructureRubbleHeight\":%.3f,"
		"\"groupSelectVolumeBase\":%.3f,\"maxParticleCount\":%d},"
		"\"gameText\":{\"attempted\":%s,\"ok\":%s,\"generalsCsf\":%s,"
		"\"titleLabel\":%s,\"controlBarLabel\":%s,\"controlBarLabels\":%zu}},"
		"\"archiveMount\":{\"registered\":%s,\"directory\":\"%s\","
		"\"fileMask\":\"%s\",\"archiveCount\":%d,\"totalBytes\":%.0f,"
		"\"bootProbe\":{\"attempted\":%s,\"ok\":%s,\"indexedFiles\":%zu}},"
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
		g_archive_probe.has_game_data_ini ? "true" : "false",
		g_archive_probe.has_weapon_ini ? "true" : "false",
		g_archive_probe.game_data_attempted ? "true" : "false",
		g_archive_probe.game_data_ok ? "true" : "false",
		g_archive_probe.game_data_bytes,
		g_archive_probe.game_data_parsed_fields,
		game_data_shell_map_name_json.c_str(),
		g_archive_probe.game_data_use_fps_limit ? "true" : "false",
		g_archive_probe.game_data_frames_per_second_limit,
		g_archive_probe.game_data_max_shell_screens,
		g_archive_probe.game_data_use_cloud_map ? "true" : "false",
		g_archive_probe.game_data_default_structure_rubble_height,
		g_archive_probe.game_data_group_select_volume_base,
		g_archive_probe.game_data_max_particle_count,
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
