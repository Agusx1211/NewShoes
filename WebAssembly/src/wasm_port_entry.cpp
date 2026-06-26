#include <cstdint>
#include <cstdio>
#include <string>

#include "wasm_archive_probe.h"

#include "Common/RandomValue.h"
#include "GameLogic/LogicRandomValue.h"

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
bool g_original_core_probe_ok = false;
Int g_original_logic_random_value = 0;
UnsignedInt g_original_logic_seed_crc = 0;
ArchiveProbeResult g_archive_probe;
std::string g_state_json;

struct ArchiveMountState
{
	bool registered = false;
	std::string directory;
	std::string file_mask;
	int archive_count = 0;
	double total_bytes = 0.0;
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
}

void run_original_core_probe()
{
	char file[] = "cnc_port_boot";
	InitRandom(ORIGINAL_CORE_PROBE_SEED);
	g_original_logic_random_value = GetGameLogicRandomValue(10, 100, file, 1);
	g_original_logic_seed_crc = GetGameLogicRandomSeedCRC();
	g_original_core_probe_ok = true;
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
	char buffer[2200];
	const std::string archive_path_json = json_escape(g_archive_probe.archive_path);
	const std::string archive_mount_directory_json = json_escape(g_archive_mount.directory);
	const std::string archive_mount_file_mask_json = json_escape(g_archive_mount.file_mask);
	std::snprintf(buffer, sizeof(buffer),
		"{\"booted\":%s,\"frame\":%u,\"module\":\"wasm-port-bootstrap\","
		"\"mainLoop\":{\"running\":%s,\"fps\":%d,\"ticks\":%u},"
		"\"timing\":{\"source\":\"emscripten_get_now\",\"ok\":%s,"
		"\"bootMs\":%.3f,\"lastTickMs\":%.3f,\"lastDeltaMs\":%.3f},"
		"\"assetProbe\":{\"attempted\":%s,\"ok\":%s,\"loaded\":%s,"
		"\"archive\":\"%s\",\"reader\":\"Win32BIGFileSystem\","
		"\"indexedFiles\":%zu,\"sampleBytes\":%zu,"
		"\"inizh\":{\"armorIni\":%s,\"commandButtonIni\":%s,\"weaponIni\":%s}},"
		"\"archiveMount\":{\"registered\":%s,\"directory\":\"%s\","
		"\"fileMask\":\"%s\",\"archiveCount\":%d,\"totalBytes\":%.0f},"
		"\"originalEngineLinked\":true,"
		"\"originalCoreProbe\":{\"source\":\"GameEngine/Common/RandomValue.cpp\","
		"\"seed\":%u,\"logicRandomValue\":%d,\"logicSeedCRC\":%u,\"ok\":%s}}",
		g_booted ? "true" : "false",
		g_frame,
		g_main_loop_running ? "true" : "false",
		EMSCRIPTEN_MAIN_LOOP_FPS,
		g_main_loop_ticks,
		g_timing_probe_ok ? "true" : "false",
		g_boot_time_ms,
		g_last_tick_time_ms,
		g_last_tick_delta_ms,
		g_archive_probe.attempted ? "true" : "false",
		g_archive_probe.ok ? "true" : "false",
		g_archive_probe.loaded ? "true" : "false",
		archive_path_json.c_str(),
		g_archive_probe.indexed_file_count,
		g_archive_probe.sample_bytes,
		g_archive_probe.has_armor_ini ? "true" : "false",
		g_archive_probe.has_command_button_ini ? "true" : "false",
		g_archive_probe.has_weapon_ini ? "true" : "false",
		g_archive_mount.registered ? "true" : "false",
		archive_mount_directory_json.c_str(),
		archive_mount_file_mask_json.c_str(),
		g_archive_mount.archive_count,
		g_archive_mount.total_bytes,
		ORIGINAL_CORE_PROBE_SEED,
		g_original_logic_random_value,
		g_original_logic_seed_crc,
		g_original_core_probe_ok ? "true" : "false");
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
