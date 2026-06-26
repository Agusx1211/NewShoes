#include "wasm_archive_probe.h"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstring>
#include <strings.h>
#include <string>
#include <vector>

#include "PreRTS.h"

#include "Common/ArchiveFileSystem.h"
#include "Common/File.h"
#include "Common/FileSystem.h"
#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/INI.h"
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

std::string trim_ascii(std::string value)
{
	const std::size_t begin = value.find_first_not_of(" \t\r\n");
	if (begin == std::string::npos) {
		return "";
	}

	const std::size_t end = value.find_last_not_of(" \t\r\n");
	return value.substr(begin, end - begin + 1);
}

bool parse_key_value_line(const std::string &line, std::string &key, std::string &value)
{
	std::string uncommented = line.substr(0, line.find(';'));
	const std::size_t equals = uncommented.find('=');
	if (equals == std::string::npos) {
		return false;
	}

	key = trim_ascii(uncommented.substr(0, equals));
	value = trim_ascii(uncommented.substr(equals + 1));
	return !key.empty() && !value.empty();
}

bool parse_game_data_value(
	const std::string &key,
	const std::string &value,
	INIFieldParseProc parser,
	void *store)
{
	if (parser == nullptr || store == nullptr) {
		return false;
	}

	std::string synthetic_line = key + " = " + value;
	std::vector<char> mutable_line(synthetic_line.begin(), synthetic_line.end());
	mutable_line.push_back('\0');

	try {
		INI ini;
		if (std::strtok(mutable_line.data(), ini.getSeps()) == nullptr) {
			return false;
		}
		parser(&ini, nullptr, store, nullptr);
	} catch (...) {
		return false;
	}

	return true;
}

void probe_original_game_data_ini(FileSystem &file_system, ArchiveProbeResult &result)
{
	result.game_data_attempted = true;

	std::vector<char> game_data;
	if (!read_archive_file(file_system, GAME_DATA_INI_PATH, game_data)) {
		return;
	}

	result.game_data_bytes = game_data.size();

	std::string contents(game_data.begin(), game_data.end());
	std::size_t offset = 0;
	bool shell_map_name_ok = false;
	bool use_fps_limit_ok = false;
	bool frames_per_second_limit_ok = false;
	bool max_shell_screens_ok = false;
	bool use_cloud_map_ok = false;
	bool default_structure_rubble_height_ok = false;
	bool group_select_volume_base_ok = false;
	bool max_particle_count_ok = false;

	while (offset <= contents.size()) {
		const std::size_t newline = contents.find_first_of("\r\n", offset);
		const std::string line = contents.substr(
			offset,
			newline == std::string::npos ? std::string::npos : newline - offset);
		if (newline == std::string::npos) {
			offset = contents.size() + 1;
		} else {
			offset = newline + 1;
			if (offset < contents.size() && contents[newline] == '\r' && contents[offset] == '\n') {
				++offset;
			}
		}

		std::string key;
		std::string value;
		if (!parse_key_value_line(line, key, value)) {
			continue;
		}

		if (strcasecmp(key.c_str(), "ShellMapName") == 0) {
			AsciiString parsed;
			if (parse_game_data_value(key, value, INI::parseAsciiString, &parsed)) {
				result.game_data_shell_map_name = parsed.str();
				shell_map_name_ok = result.game_data_shell_map_name == EXPECTED_SHELL_MAP_NAME;
			}
		} else if (strcasecmp(key.c_str(), "UseFPSLimit") == 0) {
			Bool parsed = FALSE;
			if (parse_game_data_value(key, value, INI::parseBool, &parsed)) {
				result.game_data_use_fps_limit = parsed;
				use_fps_limit_ok = parsed;
			}
		} else if (strcasecmp(key.c_str(), "FramesPerSecondLimit") == 0) {
			Int parsed = 0;
			if (parse_game_data_value(key, value, INI::parseInt, &parsed)) {
				result.game_data_frames_per_second_limit = parsed;
				frames_per_second_limit_ok = parsed == 30;
			}
		} else if (strcasecmp(key.c_str(), "MaxShellScreens") == 0) {
			Int parsed = 0;
			if (parse_game_data_value(key, value, INI::parseInt, &parsed)) {
				result.game_data_max_shell_screens = parsed;
				max_shell_screens_ok = parsed == 8;
			}
		} else if (strcasecmp(key.c_str(), "UseCloudMap") == 0) {
			Bool parsed = FALSE;
			if (parse_game_data_value(key, value, INI::parseBool, &parsed)) {
				result.game_data_use_cloud_map = parsed;
				use_cloud_map_ok = parsed;
			}
		} else if (strcasecmp(key.c_str(), "DefaultStructureRubbleHeight") == 0) {
			Real parsed = 0.0f;
			if (parse_game_data_value(key, value, INI::parseReal, &parsed)) {
				result.game_data_default_structure_rubble_height = parsed;
				default_structure_rubble_height_ok = std::fabs(parsed - 10.0f) < 0.001f;
			}
		} else if (strcasecmp(key.c_str(), "GroupSelectVolumeBase") == 0) {
			Real parsed = 0.0f;
			if (parse_game_data_value(key, value, INI::parseReal, &parsed)) {
				result.game_data_group_select_volume_base = parsed;
				group_select_volume_base_ok = std::fabs(parsed - 0.5f) < 0.001f;
			}
		} else if (strcasecmp(key.c_str(), "MaxParticleCount") == 0) {
			Int parsed = 0;
			if (parse_game_data_value(key, value, INI::parseInt, &parsed)) {
				result.game_data_max_particle_count = parsed;
				max_particle_count_ok = parsed == 2500;
			}
		}
	}

	result.game_data_parsed_fields =
		(shell_map_name_ok ? 1U : 0U) +
		(use_fps_limit_ok ? 1U : 0U) +
		(frames_per_second_limit_ok ? 1U : 0U) +
		(max_shell_screens_ok ? 1U : 0U) +
		(use_cloud_map_ok ? 1U : 0U) +
		(default_structure_rubble_height_ok ? 1U : 0U) +
		(group_select_volume_base_ok ? 1U : 0U) +
		(max_particle_count_ok ? 1U : 0U);
	result.game_data_ok =
		result.game_data_bytes > 10000 &&
		result.game_data_parsed_fields == 8;
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
			result.has_armor_ini = archive_file_system.doesFileExist("Data\\INI\\Armor.ini");
			result.has_command_button_ini = archive_file_system.doesFileExist("Data\\INI\\CommandButton.ini");
			result.has_game_data_ini = archive_file_system.doesFileExist(GAME_DATA_INI_PATH);
			result.has_weapon_ini = archive_file_system.doesFileExist("Data\\INI\\Weapon.ini");
			result.has_generals_csf = archive_file_system.doesFileExist("Data\\English\\Generals.csf");

			std::vector<char> sample_data;
			const bool sample_ok = read_first_indexed_archive_file(
				archive_file_system,
				file_system,
				sample_data,
				result.indexed_file_count);
			result.sample_bytes = sample_data.size();
			if (result.has_game_data_ini) {
				probe_original_game_data_ini(file_system, result);
			}
			result.ok =
				sample_ok &&
				result.indexed_file_count > 0 &&
				(!result.has_game_data_ini || result.game_data_ok);
			if (result.has_generals_csf) {
				probe_original_game_text(result);
			}
		}

		TheFileSystem = nullptr;
		TheArchiveFileSystem = nullptr;
		TheLocalFileSystem = nullptr;
	}

	shutdownMemoryManager();

	return result;
}
