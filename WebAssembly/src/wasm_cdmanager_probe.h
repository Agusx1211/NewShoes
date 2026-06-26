#pragma once

#include <string>

struct CDManagerProbeResult
{
	bool attempted = false;
	bool ok = false;
	bool created = false;
	bool initialized = false;
	bool no_cd_drives = false;
	int drive_count = 0;
	std::string source;
};

CDManagerProbeResult probe_original_cd_manager();
