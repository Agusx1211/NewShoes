#include "wasm_startup_singletons_probe.h"

#include "PreRTS.h"

#include "wasm_browser_runtime_assets.h"
#include "Common/FileSystem.h"
#include "Common/GameMemory.h"
#include "Common/GameLOD.h"
#include "Common/GlobalData.h"
#include "Common/INI.h"
#include "Common/MessageStream.h"
#include "Common/NameKeyGenerator.h"
#include "Common/SubsystemInterface.h"
#include "Common/XferCRC.h"
#include "GameClient/MapUtil.h"

#include <cstddef>
#include <cstdlib>
#include <cstdio>
#include <cstring>
#include <new>
#include <utility>

namespace {
constexpr const char GAME_LOD_INI_PATH[] = "Data\\INI\\GameLOD.ini";
constexpr const char GAME_LOD_PRESETS_INI_PATH[] = "Data\\INI\\GameLODPresets.ini";
constexpr const char MAP_CACHE_INI_PATH[] = "Maps\\MapCache.ini";

StartupSingletonsProbeResult g_startup_singletons_state;
GlobalData *g_startup_global_data = nullptr;
SubsystemInterfaceList *g_startup_subsystem_list = nullptr;
CommandList *g_startup_command_list = nullptr;
GameLODManager *g_startup_game_lod_manager = nullptr;
MapCache *g_startup_map_cache = nullptr;
bool g_startup_command_list_initialized = false;
int g_startup_probe_init_count = 0;
int g_startup_probe_shutdown_count = 0;

const char *json_bool(bool value)
{
	return value ? "true" : "false";
}

std::string json_escape(const std::string &value)
{
	std::string escaped;
	escaped.reserve(value.size());
	for (char ch : value) {
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

class StartupProbeSubsystem final : public SubsystemInterface
{
public:
	StartupProbeSubsystem(int *init_count, int *shutdown_count) :
		m_init_count(init_count),
		m_shutdown_count(shutdown_count)
	{
	}

	~StartupProbeSubsystem() override
	{
		if (m_shutdown_count != nullptr) {
			++(*m_shutdown_count);
		}
	}

	void init() override
	{
		if (m_init_count != nullptr) {
			++(*m_init_count);
		}
	}

	void reset() override {}
	void update() override {}
	void draw() override {}

private:
	int *m_init_count = nullptr;
	int *m_shutdown_count = nullptr;
};

StartupProbeSubsystem *g_startup_probe_subsystem = nullptr;

template <typename T, typename... Args>
T *construct_persistent_startup_singleton(Args&&... args)
{
	static_assert(alignof(T) <= alignof(std::max_align_t),
		"startup singleton type requires over-aligned storage");
	// Keep residency off static storage while the original allocator/free path is
	// still unsafe after archive preflight.
	void *storage = std::malloc(sizeof(T));
	if (storage == nullptr) {
		throw std::bad_alloc();
	}

	try {
		return new (storage) T(std::forward<Args>(args)...);
	} catch (...) {
		std::free(storage);
		throw;
	}
}

void ensure_owned_instances()
{
	if (!isMemoryManagerOfficiallyInited()) {
		initMemoryManager();
	}

	if (g_startup_subsystem_list == nullptr) {
		g_startup_subsystem_list =
			construct_persistent_startup_singleton<SubsystemInterfaceList>();
	}
	TheSubsystemList = g_startup_subsystem_list;

	if (g_startup_global_data == nullptr) {
		g_startup_global_data = construct_persistent_startup_singleton<GlobalData>();
	}
	if (g_startup_command_list == nullptr) {
		g_startup_command_list = construct_persistent_startup_singleton<CommandList>();
		g_startup_command_list->init();
		g_startup_command_list_initialized = true;
	}
	if (g_startup_game_lod_manager == nullptr) {
		g_startup_game_lod_manager =
			construct_persistent_startup_singleton<GameLODManager>();
	}
	if (g_startup_map_cache == nullptr) {
		g_startup_map_cache = construct_persistent_startup_singleton<MapCache>();
	}

	TheWritableGlobalData = g_startup_global_data;
	TheCommandList = g_startup_command_list;
	TheGameLODManager = g_startup_game_lod_manager;
	TheMapCache = g_startup_map_cache;
}

bool file_exists(const char *path)
{
	return TheFileSystem != nullptr && path != nullptr && TheFileSystem->doesFileExist(path);
}

bool map_cache_file_exists()
{
	return file_exists(MAP_CACHE_INI_PATH) ||
		file_exists("maps\\mapcache.ini") ||
		file_exists("Maps/MapCache.ini") ||
		file_exists("maps/mapcache.ini");
}

bool run_subsystem_list_probe(StartupSingletonsProbeResult &result)
{
	if (TheSubsystemList == nullptr) {
		return false;
	}

	if (g_startup_probe_subsystem == nullptr) {
		g_startup_probe_subsystem =
			construct_persistent_startup_singleton<StartupProbeSubsystem>(
				&g_startup_probe_init_count,
				&g_startup_probe_shutdown_count);
		TheSubsystemList->initSubsystem(
			g_startup_probe_subsystem,
			nullptr,
			nullptr,
			nullptr,
			nullptr,
			AsciiString("BrowserStartupSingletonProbe"));
	}
	TheSubsystemList->postProcessLoadAll();
	TheSubsystemList->resetAll();

	result.subsystem_init_count = g_startup_probe_init_count;
	result.subsystem_shutdown_count = g_startup_probe_shutdown_count;
	result.subsystem_shutdown_deferred =
		g_startup_probe_subsystem != nullptr &&
		g_startup_probe_shutdown_count == 0;
	return g_startup_probe_init_count == 1 && result.subsystem_shutdown_deferred;
}

bool run_xfer_crc_probe(StartupSingletonsProbeResult &result)
{
	XferCRC xfer_crc;
	xfer_crc.open(AsciiString("lightCRC"));
	result.xfer_crc_initial = xfer_crc.getCRC();
	result.xfer_crc_opened = result.xfer_crc_initial == 0;
	xfer_crc.close();
	return result.xfer_crc_opened;
}

bool run_game_lod_probe(StartupSingletonsProbeResult &result)
{
	result.game_lod_files_ready =
		file_exists(GAME_LOD_INI_PATH) &&
		file_exists(GAME_LOD_PRESETS_INI_PATH);
	if (!result.game_lod_files_ready || TheGameLODManager == nullptr) {
		return false;
	}

	TheGameLODManager->init();
	result.static_lod = TheGameLODManager->getStaticLODLevel();
	result.dynamic_lod = TheGameLODManager->getDynamicLODLevel();
	result.texture_reduction = TheGameLODManager->getLevelTextureReduction(STATIC_GAME_LOD_LOW);
	result.memory_passed = TheGameLODManager->didMemPass();

	return std::strcmp(TheGameLODManager->getStaticGameLODLevelName(STATIC_GAME_LOD_LOW), "Low") == 0 &&
		std::strcmp(TheGameLODManager->getDynamicGameLODLevelName(DYNAMIC_GAME_LOD_HIGH), "High") == 0 &&
		TheGameLODManager->getDynamicGameLODIndex(AsciiString("High")) == DYNAMIC_GAME_LOD_HIGH &&
		result.texture_reduction >= 0;
}

bool run_map_cache_probe(StartupSingletonsProbeResult &result)
{
	result.map_cache_file_ready = map_cache_file_exists();
	return false;
}

void finish_status(StartupSingletonsProbeResult &result)
{
	if (!result.runtime_archive_registered) {
		result.status = "missing_runtime_archives";
		result.next_required = "runtimeArchiveSet";
		return;
	}
	if (!result.runtime_globals_installed) {
		result.status = "missing_runtime_globals";
		result.next_required = "browserRuntimeAssets";
		return;
	}
	if (!result.heap_allocated ||
		!result.name_key_generator_owned ||
		!result.command_list_owned ||
		!result.command_list_initialized ||
		!result.command_list_empty ||
		!result.xfer_crc_opened ||
		!result.global_data_owned ||
		!result.subsystem_list_owned ||
		!result.game_lod_owned ||
		!result.map_cache_owned) {
		result.status = "startup_singleton_probe_failed";
		result.next_required = "startupSingletonOwnership";
		return;
	}
	if (!result.game_lod_files_ready) {
		result.status = "missing_game_lod_files";
		result.next_required = "GameLODStartupFiles";
		return;
	}
	if (!result.subsystem_init_shutdown_ok ||
		!result.game_lod_initialized) {
		result.status = "startup_singleton_probe_failed";
		result.next_required = "startupSingletonOwnership";
		return;
	}

	result.status = "ready";
	result.next_required = "createAudioManager";
}
} // namespace

#ifndef CNC_PORT_LINKS_REAL_MINIMUM_REQUIREMENTS
Bool __attribute__((weak)) testMinimumRequirements(
	ChipsetType *video_chip_type,
	CpuType *cpu_type,
	Int *cpu_freq,
	Int *num_ram,
	Real *int_bench_index,
	Real *float_bench_index,
	Real *mem_bench_index)
{
	if (video_chip_type != nullptr) {
		*video_chip_type = DC_GENERIC_PIXEL_SHADER_2_0;
	}
	if (cpu_type != nullptr) {
		*cpu_type = P4;
	}
	if (cpu_freq != nullptr) {
		*cpu_freq = 2400;
	}
	if (num_ram != nullptr) {
		*num_ram = 512 * 1024 * 1024;
	}
	if (int_bench_index != nullptr) {
		*int_bench_index = 1.0f;
	}
	if (float_bench_index != nullptr) {
		*float_bench_index = 1.0f;
	}
	if (mem_bench_index != nullptr) {
		*mem_bench_index = 1.0f;
	}
	return TRUE;
}
#endif

const StartupSingletonsProbeResult &wasm_startup_singletons_install(
	const char *archive_directory,
	const char *archive_file_mask)
{
	StartupSingletonsProbeResult result;
	result.attempted = true;
	result.source =
		"GameEngine.cpp startup singleton ownership: SubsystemInterfaceList + "
		"CommandList + XferCRC + GameLODManager + MapCache";
	result.runtime_archive_registered =
		archive_directory != nullptr &&
		archive_directory[0] != '\0' &&
		archive_file_mask != nullptr &&
		archive_file_mask[0] != '\0';

	if (!result.runtime_archive_registered) {
		result.map_cache_update_runtime_ready = false;
		finish_status(result);
		g_startup_singletons_state = result;
		return g_startup_singletons_state;
	}

	try {
		const WasmBrowserRuntimeAssetsState &initial_runtime_assets =
			wasm_browser_runtime_assets_state();
		const bool runtime_assets_already_installed =
			initial_runtime_assets.installed &&
			initial_runtime_assets.archive_loaded &&
			initial_runtime_assets.archive_directory == archive_directory &&
			initial_runtime_assets.archive_file_mask == archive_file_mask;
		if (!runtime_assets_already_installed) {
			wasm_browser_runtime_assets_install_archive_set(archive_directory, archive_file_mask);
		}

		const WasmBrowserRuntimeAssetsState &runtime_assets =
			wasm_browser_runtime_assets_state();
		result.runtime_globals_installed =
			runtime_assets.installed &&
			runtime_assets.file_probe.global_owner_ok;

		ensure_owned_instances();
		result.global_data_owned = TheWritableGlobalData == g_startup_global_data;
		result.name_key_generator_owned =
			runtime_assets.name_key_generator_initialized &&
			runtime_assets.file_probe.name_key_generator_global;
		result.command_list_owned = TheCommandList == g_startup_command_list;
		result.command_list_initialized =
			result.command_list_owned &&
			g_startup_command_list_initialized;
		result.command_list_empty =
			result.command_list_owned &&
			g_startup_command_list != nullptr &&
			g_startup_command_list->getFirstMessage() == nullptr;
		result.subsystem_list_owned = TheSubsystemList == g_startup_subsystem_list;
		result.game_lod_owned = TheGameLODManager == g_startup_game_lod_manager;
		result.map_cache_owned = TheMapCache == g_startup_map_cache;
		result.heap_allocated =
			g_startup_global_data != nullptr &&
			g_startup_subsystem_list != nullptr &&
			g_startup_command_list != nullptr &&
			g_startup_game_lod_manager != nullptr &&
			g_startup_map_cache != nullptr;

		if (result.runtime_globals_installed &&
			result.heap_allocated &&
			result.name_key_generator_owned &&
			result.command_list_owned &&
			result.command_list_initialized &&
			result.command_list_empty &&
			result.global_data_owned &&
			result.subsystem_list_owned &&
			result.game_lod_owned &&
			result.map_cache_owned) {
			run_xfer_crc_probe(result);
			result.game_lod_initialized = run_game_lod_probe(result);
			if (result.game_lod_files_ready) {
				result.subsystem_init_shutdown_ok = run_subsystem_list_probe(result);
			}
			result.map_cache_loaded = run_map_cache_probe(result);
		}
	} catch (...) {
		result.ok = false;
	}

	result.map_cache_update_runtime_ready = false;
	result.ok =
		result.runtime_archive_registered &&
		result.runtime_globals_installed &&
		result.heap_allocated &&
		result.name_key_generator_owned &&
		result.command_list_owned &&
		result.command_list_initialized &&
		result.command_list_empty &&
		result.xfer_crc_opened &&
		result.global_data_owned &&
		result.subsystem_list_owned &&
		result.subsystem_init_shutdown_ok &&
		result.game_lod_owned &&
		result.game_lod_initialized &&
		result.map_cache_owned;
	finish_status(result);
	g_startup_singletons_state = result;
	return g_startup_singletons_state;
}

const StartupSingletonsProbeResult &wasm_startup_singletons_state()
{
	return g_startup_singletons_state;
}

const char *wasm_startup_singletons_state_json()
{
	const StartupSingletonsProbeResult &state = g_startup_singletons_state;
	const std::string source_json = json_escape(state.source != nullptr ? state.source : "");
	const std::string status_json = json_escape(state.status != nullptr ? state.status : "");
	const std::string next_required_json =
		json_escape(state.next_required != nullptr ? state.next_required : "");
	static char json[8192];
	std::snprintf(json, sizeof(json),
		"{\"attempted\":%s,\"ok\":%s,\"source\":\"%s\","
		"\"status\":\"%s\",\"nextRequired\":\"%s\","
		"\"runtimeArchiveRegistered\":%s,"
		"\"runtimeGlobalsInstalled\":%s,\"heapAllocated\":%s,"
		"\"nameKeyGeneratorOwned\":%s,"
		"\"commandList\":{\"owned\":%s,\"initialized\":%s,\"empty\":%s},"
		"\"xferCRC\":{\"opened\":%s,\"initialCRC\":%u},"
		"\"globalDataOwned\":%s,"
		"\"subsystemListOwned\":%s,\"subsystemInitShutdownOk\":%s,"
		"\"subsystemShutdownDeferred\":%s,"
		"\"subsystemInitCount\":%d,\"subsystemShutdownCount\":%d,"
		"\"gameLOD\":{\"owned\":%s,\"filesReady\":%s,"
		"\"initialized\":%s,\"staticLOD\":%d,\"dynamicLOD\":%d,"
		"\"textureReduction\":%d,\"memoryPassed\":%s},"
		"\"mapCache\":{\"owned\":%s,\"fileReady\":%s,"
		"\"gameTextLoaded\":%s,\"loaded\":%s,\"maps\":%zu,"
		"\"multiplayerMaps\":%zu,\"officialMaps\":%zu,"
		"\"shellMapMD\":%s,\"tournamentDesert\":%s,"
		"\"tournamentDesertPlayers\":%d,"
		"\"updateCacheRuntimeReady\":%s}}",
		json_bool(state.attempted),
		json_bool(state.ok),
		source_json.c_str(),
		status_json.c_str(),
		next_required_json.c_str(),
		json_bool(state.runtime_archive_registered),
		json_bool(state.runtime_globals_installed),
		json_bool(state.heap_allocated),
		json_bool(state.name_key_generator_owned),
		json_bool(state.command_list_owned),
		json_bool(state.command_list_initialized),
		json_bool(state.command_list_empty),
		json_bool(state.xfer_crc_opened),
		state.xfer_crc_initial,
		json_bool(state.global_data_owned),
		json_bool(state.subsystem_list_owned),
		json_bool(state.subsystem_init_shutdown_ok),
		json_bool(state.subsystem_shutdown_deferred),
		state.subsystem_init_count,
		state.subsystem_shutdown_count,
		json_bool(state.game_lod_owned),
		json_bool(state.game_lod_files_ready),
		json_bool(state.game_lod_initialized),
		state.static_lod,
		state.dynamic_lod,
		state.texture_reduction,
		json_bool(state.memory_passed),
		json_bool(state.map_cache_owned),
		json_bool(state.map_cache_file_ready),
		json_bool(state.map_cache_game_text_loaded),
		json_bool(state.map_cache_loaded),
		state.map_count,
		state.multiplayer_count,
		state.official_count,
		json_bool(state.has_shell_map_md),
		json_bool(state.has_tournament_desert),
		state.tournament_desert_players,
		json_bool(state.map_cache_update_runtime_ready));
	return json;
}
