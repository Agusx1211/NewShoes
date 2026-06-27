// wasm_browser_device.cpp — see wasm_browser_device.h.

#include "PreRTS.h"

#include "wasm_browser_device.h"

BrowserDeviceScope::BrowserDeviceScope()
{
	// Save the prior global pointers so nested scopes (and the eventual real
	// W3DDisplay/GameEngine startup owner) restore cleanly. This mirrors the
	// order the shipped mesh probe used to inline.
	m_old_file_system = TheFileSystem;
	m_old_local_file_system = TheLocalFileSystem;
	m_old_archive_file_system = TheArchiveFileSystem;
	m_old_name_key_generator = TheNameKeyGenerator;
	m_old_w3d_file_system = TheW3DFileSystem;
	m_old_file_factory = _TheFileFactory;

	TheLocalFileSystem = &m_local_file_system;
	TheArchiveFileSystem = &m_archive_file_system;
	TheFileSystem = &m_file_system;
	TheNameKeyGenerator = &m_name_key_generator;

	m_name_key_generator.init();
	m_file_system.init();

	m_active = true;
}

BrowserDeviceScope::~BrowserDeviceScope()
{
	if (!m_active) {
		return;
	}

	// Tear down the W3D file factory first, mirroring ~W3DDisplay()'s
	// `delete TheW3DFileSystem; TheW3DFileSystem = NULL;` ordering relative to
	// the file-system singletons. The W3DFileSystem destructor clears
	// _TheFileFactory back to NULL.
	if (m_w3d_file_system != nullptr) {
		delete m_w3d_file_system;
		m_w3d_file_system = nullptr;
	}

	m_name_key_generator.reset();

	TheNameKeyGenerator = m_old_name_key_generator;
	TheFileSystem = m_old_file_system;
	TheArchiveFileSystem = m_old_archive_file_system;
	TheLocalFileSystem = m_old_local_file_system;
	TheW3DFileSystem = m_old_w3d_file_system;
	_TheFileFactory = m_old_file_factory;

	m_active = false;
}

W3DFileSystem *BrowserDeviceScope::install_w3d_file_system()
{
	if (m_w3d_file_system != nullptr) {
		return m_w3d_file_system;
	}

	// W3DFileSystem's constructor installs itself as _TheFileFactory, exactly
	// like `TheW3DFileSystem = NEW W3DFileSystem;` in W3DDisplay::init().
	TheW3DFileSystem = new W3DFileSystem;
	m_w3d_file_system = TheW3DFileSystem;
	return m_w3d_file_system;
}
