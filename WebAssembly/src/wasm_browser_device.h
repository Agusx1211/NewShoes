// wasm_browser_device.h — shared browser display/device startup owner.
//
// The original Win32 game installs the file-system + W3D device singletons
// inside `W3DDisplay::init()` / `~W3DDisplay()` (see
// GeneralsMD/Code/GameEngineDevice/Source/W3DDevice/GameClient/W3DDisplay.cpp):
//   * TheLocalFileSystem   (Win32LocalFileSystem)
//   * TheArchiveFileSystem (Win32BIGFileSystem)
//   * TheFileSystem        (FileSystem facade over local + archive)
//   * TheNameKeyGenerator  (NameKeyGenerator)
//   * TheW3DFileSystem     (W3DFileSystem — overrides _TheFileFactory)
//
// Until the real W3DDisplay / GameEngine runtime links into the browser build,
// the WW3D render probes need the same singleton ownership but without the
// full device/UI surface. `BrowserDeviceScope` is that shared owner: it is an
// RAII scope that installs (and on destruction restores) the browser-backed
// file-system singletons and, on demand, the W3D file factory, mirroring the
// ordering of `W3DDisplay::init()` / `~W3DDisplay()` so future engine startup
// can take this ownership over in one place.
//
// The W3D file factory is installed via an explicit
// `install_w3d_file_system()` instead of the constructor because, like
// `W3DDisplay::init()`, it must run after `WW3D::Init()` / `Set_Render_Device()`
// and be torn down before/around `WW3D::Shutdown()`.

#pragma once

#include "Common/ArchiveFileSystem.h"
#include "Common/FileSystem.h"
#include "Common/LocalFileSystem.h"
#include "Common/NameKeyGenerator.h"
#include "Win32Device/Common/Win32BIGFileSystem.h"
#include "Win32Device/Common/Win32LocalFileSystem.h"
#include "W3DDevice/GameClient/W3DFileSystem.h"
#include "ffactory.h"

class BrowserDeviceScope
{
public:
	BrowserDeviceScope();
	~BrowserDeviceScope();

	BrowserDeviceScope(const BrowserDeviceScope &) = delete;
	BrowserDeviceScope &operator=(const BrowserDeviceScope &) = delete;

	// True once the file-system singletons are installed.
	bool is_active() const { return m_active; }

	// True once install_w3d_file_system() has run and TheW3DFileSystem /
	// _TheFileFactory point at the scope-owned W3DFileSystem.
	bool w3d_file_system_installed() const { return m_w3d_file_system != nullptr; }

	// Access the scope-owned singletons (valid while is_active()).
	Win32LocalFileSystem &local_file_system() { return m_local_file_system; }
	Win32BIGFileSystem &archive_file_system() { return m_archive_file_system; }
	FileSystem &file_system() { return m_file_system; }
	NameKeyGenerator &name_key_generator() { return m_name_key_generator; }
	W3DFileSystem *w3d_file_system() const { return m_w3d_file_system; }

	// Install TheW3DFileSystem / _TheFileFactory. Mirrors the
	// `TheW3DFileSystem = NEW W3DFileSystem;` line in W3DDisplay::init() and
	// must run after WW3D::Init()/Set_Render_Device(). Returns the installed
	// W3DFileSystem (also reachable via w3d_file_system()). Safe to call once.
	W3DFileSystem *install_w3d_file_system();

private:
	bool m_active = false;

	// Prior global state saved on construction, restored on destruction.
	FileSystem *m_old_file_system = nullptr;
	LocalFileSystem *m_old_local_file_system = nullptr;
	ArchiveFileSystem *m_old_archive_file_system = nullptr;
	NameKeyGenerator *m_old_name_key_generator = nullptr;
	W3DFileSystem *m_old_w3d_file_system = nullptr;
	FileFactoryClass *m_old_file_factory = nullptr;

	// Scope-owned browser-backed singletons.
	Win32LocalFileSystem m_local_file_system;
	Win32BIGFileSystem m_archive_file_system;
	FileSystem m_file_system;
	NameKeyGenerator m_name_key_generator;
	W3DFileSystem *m_w3d_file_system = nullptr;
};
