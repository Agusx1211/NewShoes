#include "wasm_globaldata_probe.h"

#include "PreRTS.h"

#include "Common/ArchiveFileSystem.h"
#include "Common/FileSystem.h"
#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/LocalFileSystem.h"
#include "Win32Device/Common/Win32BIGFileSystem.h"
#include "Win32Device/Common/Win32LocalFileSystem.h"

GlobalDataProbeResult probe_original_global_data()
{
	GlobalDataProbeResult result;
	result.attempted = true;
	result.source = "GameEngine/Common/GlobalData.cpp";

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

		global_data = new GlobalData;
		TheWritableGlobalData = global_data;

		result.x_resolution = global_data->m_xResolution;
		result.y_resolution = global_data->m_yResolution;
		result.frames_per_second_limit = global_data->m_framesPerSecondLimit;
		result.max_particle_count = global_data->m_maxParticleCount;
		result.max_field_particle_count = global_data->m_maxFieldParticleCount;
		result.exe_crc = global_data->m_exeCRC;
		result.network_disconnect_time = global_data->m_networkDisconnectTime;
		result.network_player_timeout_time = global_data->m_networkPlayerTimeoutTime;
		result.double_click_time_ms = global_data->m_doubleClickTimeMS;
		result.use_trees = global_data->m_useTrees;
		result.use_tree_sway = global_data->m_useTreeSway;
		result.use_heat_effects = global_data->m_useHeatEffects;
		result.use_fps_limit = global_data->m_useFpsLimit;
		result.windowed = global_data->m_windowed;
		result.shell_map_on = global_data->m_shellMapOn;
		result.user_data_path = global_data->getPath_UserData().str();
		result.shell_map_name = global_data->m_shellMapName.str();

		result.set_time_of_day_ok = global_data->setTimeOfDay(TIME_OF_DAY_NIGHT);
		result.time_of_day = global_data->m_timeOfDay;
		result.ok =
			result.x_resolution == 800 &&
			result.y_resolution == 600 &&
			result.network_disconnect_time == 5000 &&
			result.network_player_timeout_time == 60000 &&
			result.double_click_time_ms == 500 &&
			result.set_time_of_day_ok &&
			result.time_of_day == TIME_OF_DAY_NIGHT &&
			!result.user_data_path.empty() &&
			result.shell_map_name == "Maps\\ShellMap1\\ShellMap1.map";
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
