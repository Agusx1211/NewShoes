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
#include "Win32Device/Common/Win32BIGFileSystem.h"
#include "Win32Device/Common/Win32LocalFileSystem.h"

namespace {
constexpr const char GAME_DATA_INI_PATH[] = "Data\\INI\\GameData.ini";
constexpr const char EXPECTED_SHELL_MAP_NAME[] = "Maps\\ShellMapMD\\ShellMapMD.map";

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
