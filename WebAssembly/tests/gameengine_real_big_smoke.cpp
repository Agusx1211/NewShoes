#include <algorithm>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include "PreRTS.h"

#include "Common/ArchiveFileSystem.h"
#include "Common/File.h"
#include "Common/FileSystem.h"
#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/LocalFileSystem.h"
#include "Common/SubsystemInterface.h"
#include "Win32Device/Common/Win32BIGFileSystem.h"
#include "Win32Device/Common/Win32LocalFileSystem.h"

SubsystemInterfaceList *TheSubsystemList = nullptr;
GlobalData *TheGlobalData = nullptr;
class AudioManager;
AudioManager *TheAudio = nullptr;

namespace {
bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::fprintf(stderr, "%s\n", message);
		return false;
	}
	return true;
}

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

bool contains_text(const std::vector<char> &data, const char *needle)
{
	return std::search(
		data.begin(),
		data.end(),
		needle,
		needle + std::strlen(needle)) != data.end();
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
}

int run_real_big_smoke_impl(const char *archive_path)
{
	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (!expect(archive_mask.isNotEmpty(), "archive file mask is empty")) {
		return 1;
	}

	initMemoryManager();

	bool ok = true;
	{
		Win32LocalFileSystem local_file_system;
		FileSystem file_system;
		Win32BIGFileSystem archive_file_system;
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		ok = expect(archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask),
			"Win32BIGFileSystem did not load the real BIG archive") && ok;

		const char armor_path[] = "Data\\INI\\Armor.ini";
		const char command_button_path[] = "Data\\INI\\CommandButton.ini";
		const char weapon_path[] = "Data\\INI\\Weapon.ini";

		ok = expect(archive_file_system.doesFileExist(armor_path),
			"real INIZH.big missing Armor.ini") && ok;
		ok = expect(archive_file_system.doesFileExist(command_button_path),
			"real INIZH.big missing CommandButton.ini") && ok;
		ok = expect(archive_file_system.doesFileExist(weapon_path),
			"real INIZH.big missing Weapon.ini") && ok;

		FilenameList ini_files;
		archive_file_system.getFileListInDirectory(
			AsciiString(""), AsciiString(""), AsciiString("*.ini"), ini_files, TRUE);
		ok = expect(ini_files.size() > 40, "real INIZH.big indexed too few INI files") && ok;

		std::vector<char> armor_data;
		ok = expect(read_archive_file(file_system, armor_path, armor_data),
			"real INIZH.big Armor.ini read failed") && ok;
		ok = expect(contains_text(armor_data, ";FILE: Armor.ini") &&
				contains_text(armor_data, "Armor NoArmor"),
			"real INIZH.big Armor.ini content mismatch") && ok;

		std::vector<char> command_button_data;
		ok = expect(read_archive_file(file_system, command_button_path, command_button_data),
			"real INIZH.big CommandButton.ini read failed") && ok;
		ok = expect(contains_text(command_button_data, "CommandButton") &&
				contains_text(command_button_data, "Command_"),
			"real INIZH.big CommandButton.ini content mismatch") && ok;

		std::vector<char> weapon_data;
		ok = expect(read_archive_file(file_system, weapon_path, weapon_data),
			"real INIZH.big Weapon.ini read failed") && ok;
		ok = expect(contains_text(weapon_data, ";FILE: Weapon.ini") &&
				contains_text(weapon_data, "Weapon "),
			"real INIZH.big Weapon.ini content mismatch") && ok;

		TheFileSystem = nullptr;
		TheArchiveFileSystem = nullptr;
		TheLocalFileSystem = nullptr;
	}

	shutdownMemoryManager();

	if (!ok) {
		return 1;
	}

	std::printf("{\"ok\":true,\"archive\":\"%s\",\"reader\":\"Win32BIGFileSystem\","
		"\"source\":\"GeneralsMD original\"}\n", archive_path);
	return 0;
}

extern "C" int run_real_big_smoke(const char *archive_path)
{
	return run_real_big_smoke_impl(archive_path);
}

int run_real_big_index_smoke_impl(const char *archive_path)
{
	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (!expect(archive_mask.isNotEmpty(), "archive file mask is empty")) {
		return 1;
	}

	initMemoryManager();

	bool ok = true;
	std::size_t indexed_file_count = 0;
	std::vector<char> sample_data;
	{
		Win32LocalFileSystem local_file_system;
		FileSystem file_system;
		Win32BIGFileSystem archive_file_system;
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		ok = expect(archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask),
			"Win32BIGFileSystem did not load the BIG archive") && ok;
		ok = expect(read_first_indexed_archive_file(
				archive_file_system, file_system, sample_data, indexed_file_count),
			"BIG archive did not expose any readable indexed files") && ok;

		TheFileSystem = nullptr;
		TheArchiveFileSystem = nullptr;
		TheLocalFileSystem = nullptr;
	}

	shutdownMemoryManager();

	if (!ok) {
		return 1;
	}

	std::printf("{\"ok\":true,\"archive\":\"%s\",\"reader\":\"Win32BIGFileSystem\","
		"\"indexedFiles\":%zu,\"sampleBytes\":%zu,"
		"\"source\":\"GeneralsMD original\"}\n",
		archive_path, indexed_file_count, sample_data.size());
	return 0;
}

extern "C" int run_real_big_index_smoke(const char *archive_path)
{
	return run_real_big_index_smoke_impl(archive_path);
}

#ifndef REAL_BIG_SMOKE_NO_MAIN
int main(int argc, char **argv)
{
	if (argc != 2) {
		std::fprintf(stderr, "usage: %s path/to/INIZH.big\n", argv[0]);
		return 2;
	}

	return run_real_big_smoke_impl(argv[1]);
}
#endif
