#include "wasm_filesystem_probe.h"

#include "PreRTS.h"

#include "wasm_memory_manager_scope.h"

#include <cstdio>
#include <cstring>
#include <string>

#include "Common/ArchiveFileSystem.h"
#include "Common/File.h"
#include "Common/FileSystem.h"
#include "Common/GameMemory.h"
#include "Common/LocalFileSystem.h"
#include "Common/NameKeyGenerator.h"
#include "Win32Device/Common/Win32BIGFileSystem.h"
#include "Win32Device/Common/Win32LocalFileSystem.h"

namespace {
constexpr const char LOCAL_DIRECTORY[] = "cnc-port-fs-probe";
constexpr const char LOCAL_PATH[] = "cnc-port-fs-probe/local-file.txt";
constexpr const char LOCAL_PAYLOAD[] = "cnc-port FileSystem facade\n";
constexpr const char MISSING_PATH[] = "cnc-port-fs-probe/missing-file.txt";
constexpr const char ARCHIVE_PATH[] = "Data\\INI\\Armor.ini";

bool is_registered_archive_set(const char *archive_directory, const char *archive_file_mask)
{
	return archive_directory != nullptr && archive_directory[0] != '\0' &&
		archive_file_mask != nullptr && archive_file_mask[0] != '\0';
}

bool probe_local_facade(FileSystem &file_system, FileSystemProbeResult &result)
{
	std::remove(LOCAL_PATH);

	const bool directory_created = file_system.createDirectory(AsciiString(LOCAL_DIRECTORY));
	result.local_directory_ok = directory_created || file_system.doesFileExist(LOCAL_DIRECTORY);

	File *written = file_system.openFile(LOCAL_PATH, File::WRITE | File::TEXT | File::CREATE);
	result.local_write_ok = written != nullptr;
	if (written != nullptr) {
		result.local_bytes = written->write(
			LOCAL_PAYLOAD, static_cast<Int>(std::strlen(LOCAL_PAYLOAD)));
		result.local_write_ok =
			result.local_bytes == static_cast<Int>(std::strlen(LOCAL_PAYLOAD));
		written->close();
	}

	result.local_exists_ok = file_system.doesFileExist(LOCAL_PATH);

	FileInfo info = {};
	result.local_info_ok = result.local_exists_ok &&
		file_system.getFileInfo(AsciiString(LOCAL_PATH), &info) &&
		info.sizeHigh == 0 &&
		info.sizeLow == result.local_bytes;
	result.local_info_size = info.sizeLow;

	FilenameList files;
	file_system.getFileListInDirectory(
		AsciiString("cnc-port-fs-probe/"), AsciiString("*.txt"), files, FALSE);
	result.local_list_ok = files.find(AsciiString(LOCAL_PATH)) != files.end();

	File *opened = file_system.openFile(LOCAL_PATH, File::READ | File::BINARY);
	char readback[sizeof(LOCAL_PAYLOAD)] = {};
	const Int bytes_read = opened != nullptr
		? opened->read(readback, static_cast<Int>(std::strlen(LOCAL_PAYLOAD)))
		: 0;
	result.local_read_ok =
		opened != nullptr &&
		bytes_read == static_cast<Int>(std::strlen(LOCAL_PAYLOAD)) &&
		std::memcmp(readback, LOCAL_PAYLOAD, std::strlen(LOCAL_PAYLOAD)) == 0;
	if (opened != nullptr) {
		opened->close();
	}

	std::remove(LOCAL_PATH);
	result.local_cache_ok = file_system.doesFileExist(LOCAL_PATH);

	const bool missing_first = !file_system.doesFileExist(MISSING_PATH);
	const bool missing_second = !file_system.doesFileExist(MISSING_PATH);
	result.missing_cache_ok = missing_first && missing_second;

	std::remove(LOCAL_PATH);
	result.local_ok =
		result.local_directory_ok &&
		result.local_write_ok &&
		result.local_exists_ok &&
		result.local_cache_ok &&
		result.local_info_ok &&
		result.local_list_ok &&
		result.local_read_ok &&
		result.missing_cache_ok;
	return result.local_ok;
}

bool probe_archive_facade(
	FileSystem &file_system,
	Win32BIGFileSystem &archive_file_system,
	const char *archive_directory,
	const char *archive_file_mask,
	FileSystemProbeResult &result)
{
	result.archive_attempted = true;
	result.archive_path = ARCHIVE_PATH;
	result.archive_loaded = archive_file_system.loadBigFilesFromDirectory(
		AsciiString(archive_directory), AsciiString(archive_file_mask));
	if (!result.archive_loaded) {
		return false;
	}

	FilenameList indexed_files;
	archive_file_system.getFileListInDirectory(
		AsciiString(""), AsciiString(""), AsciiString("*"), indexed_files, TRUE);
	result.archive_indexed_file_count = indexed_files.size();

	result.archive_exists_ok = file_system.doesFileExist(ARCHIVE_PATH);

	FileInfo info = {};
	result.archive_info_ok =
		file_system.getFileInfo(AsciiString(ARCHIVE_PATH), &info) &&
		info.sizeHigh == 0 &&
		info.sizeLow > 0;
	result.archive_info_size = info.sizeLow;

	FilenameList ini_files;
	file_system.getFileListInDirectory(
		AsciiString("Data\\INI\\"), AsciiString("*.ini"), ini_files, FALSE);
	result.archive_list_ok = ini_files.find(AsciiString("data\\ini\\armor.ini")) != ini_files.end();

	File *opened = file_system.openFile(ARCHIVE_PATH, File::READ | File::BINARY);
	char header[16] = {};
	result.archive_bytes = opened != nullptr ? opened->read(header, sizeof(header)) : 0;
	result.archive_read_ok =
		opened != nullptr &&
		result.archive_bytes == static_cast<Int>(sizeof(header));
	if (opened != nullptr) {
		opened->close();
	}

	result.archive_owner = archive_file_system.getArchiveFilenameForFile(ARCHIVE_PATH).str();
	result.archive_owner_ok = !result.archive_owner.empty();
	result.archive_ok =
		result.archive_loaded &&
		result.archive_indexed_file_count > 0 &&
		result.archive_exists_ok &&
		result.archive_info_ok &&
		result.archive_list_ok &&
		result.archive_read_ok &&
		result.archive_owner_ok;
	return result.archive_ok;
}
}

FileSystemProbeResult probe_original_file_system(
	const char *archive_directory,
	const char *archive_file_mask)
{
	FileSystemProbeResult result;
	result.attempted = true;
	result.source = "GameEngine/Common/System/FileSystem.cpp";
	result.local_path = LOCAL_PATH;

	ScopedOriginalMemoryManager memory_manager_scope;

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	NameKeyGenerator *name_key_generator = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		name_key_generator = NEW NameKeyGenerator;
		TheNameKeyGenerator = name_key_generator;
		name_key_generator->init();

		probe_local_facade(file_system, result);
		if (is_registered_archive_set(archive_directory, archive_file_mask)) {
			probe_archive_facade(
				file_system,
				archive_file_system,
				archive_directory,
				archive_file_mask,
				result);
		}

		result.ok = result.local_ok && (!result.archive_attempted || result.archive_ok);
	} catch (...) {
		result.ok = false;
	}

	TheNameKeyGenerator = old_name_key_generator;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (name_key_generator != nullptr) {
		delete name_key_generator;
	}

	return result;
}
