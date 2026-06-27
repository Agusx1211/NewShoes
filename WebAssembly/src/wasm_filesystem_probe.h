#pragma once

#include <cstddef>
#include <string>

struct FileSystemProbeResult
{
	bool attempted = false;
	bool ok = false;
	bool local_ok = false;
	bool local_directory_ok = false;
	bool local_write_ok = false;
	bool local_exists_ok = false;
	bool local_cache_ok = false;
	bool local_info_ok = false;
	bool local_list_ok = false;
	bool local_read_ok = false;
	bool missing_cache_ok = false;
	bool archive_attempted = false;
	bool archive_loaded = false;
	bool archive_ok = false;
	bool archive_exists_ok = false;
	bool archive_info_ok = false;
	bool archive_list_ok = false;
	bool archive_read_ok = false;
	bool archive_owner_ok = false;
	int local_bytes = 0;
	int local_info_size = 0;
	int archive_bytes = 0;
	int archive_info_size = 0;
	std::size_t archive_indexed_file_count = 0;
	std::string local_path;
	std::string archive_path;
	std::string archive_owner;
	std::string source;
};

FileSystemProbeResult probe_original_file_system(
	const char *archive_directory,
	const char *archive_file_mask);
