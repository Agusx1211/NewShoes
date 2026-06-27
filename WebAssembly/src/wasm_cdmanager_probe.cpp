#include "wasm_cdmanager_probe.h"

#include "PreRTS.h"

#include "wasm_memory_manager_scope.h"

#include "Common/ArchiveFileSystem.h"
#include "Common/CDManager.h"
#include "Common/FileSystem.h"
#include "Common/GameMemory.h"
#include "Common/LocalFileSystem.h"
#include "Win32Device/Common/Win32BIGFileSystem.h"
#include "Win32Device/Common/Win32LocalFileSystem.h"

class GameLogic;
// CDManager.cpp's update vtable references this; full GameLogic will replace it.
GameLogic *TheGameLogic __attribute__((weak)) = nullptr;

CDManagerProbeResult probe_original_cd_manager()
{
	CDManagerProbeResult result;
	result.attempted = true;
	result.source = "Win32Device/Common/Win32CDManager.cpp";

	ScopedOriginalMemoryManager memory_manager_scope;

	CDManagerInterface *old_cd_manager = TheCDManager;
	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	CDManagerInterface *manager = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		manager = CreateCDManager();
		result.created = manager != nullptr;
		TheCDManager = manager;

		if (manager != nullptr) {
			manager->init();
			result.initialized = true;
			result.drive_count = manager->driveCount();
			result.no_cd_drives = result.drive_count == 0;
			result.ok = result.no_cd_drives;
		}
	} catch (...) {
		result.ok = false;
	}

	if (manager != nullptr) {
		delete manager;
	}

	TheCDManager = old_cd_manager;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	return result;
}
