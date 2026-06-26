#include "wasm_archive_probe.h"

#include <algorithm>
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
			result.has_weapon_ini = archive_file_system.doesFileExist("Data\\INI\\Weapon.ini");
			result.has_generals_csf = archive_file_system.doesFileExist("Data\\English\\Generals.csf");

			std::vector<char> sample_data;
			const bool sample_ok = read_first_indexed_archive_file(
				archive_file_system,
				file_system,
				sample_data,
				result.indexed_file_count);
			result.sample_bytes = sample_data.size();
			result.ok = sample_ok && result.indexed_file_count > 0;
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
