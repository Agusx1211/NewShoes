#pragma once

#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>

#ifdef __cplusplus
#include <string>
#define WASM_POSIX_SCOPE ::

// --- Optional OPFS fd-intercept seam (P2 "OPFS as the disk") ---------------
// Weak hooks with strong definitions in WebAssembly/src/wasm_opfs_files.cpp,
// which is linked into cnc-port ONLY. In every other target that includes
// this header the symbols resolve to null and the wrappers below take the
// plain POSIX path unconditionally — byte-identical to the pre-P2 behavior.
// Even in cnc-port the intercept is inert until JS registers a path prefix
// (cnc_port_opfs_register_prefix) AND stages realm-local OPFS handles
// (harness/opfs_realm_files.mjs); an unregistered/unstaged path falls
// through to POSIX from inside the hook.
extern "C" {
int cnc_port_opfs_intercept_open(const char *path, int flags) __attribute__((weak));
int cnc_port_opfs_intercept_is_fd(int fd) __attribute__((weak));
int cnc_port_opfs_intercept_read(int fd, void *buffer, unsigned int length) __attribute__((weak));
long long cnc_port_opfs_intercept_lseek(int fd, long long offset, int whence) __attribute__((weak));
int cnc_port_opfs_intercept_close(int fd) __attribute__((weak));
}

static inline std::string WasmIoNormalizePath(const char *path)
{
	std::string normalized = path != nullptr ? path : "";
	for (char &ch : normalized) {
		if (ch == '\\') {
			ch = '/';
		}
	}
	return normalized;
}

static inline int WasmIoOpen(const char *path, int flags, int mode = 0666)
{
	const std::string normalized = WasmIoNormalizePath(path);
	if (cnc_port_opfs_intercept_open) {
		const int virtualFd = cnc_port_opfs_intercept_open(normalized.c_str(), flags);
		if (virtualFd >= 0) {
			return virtualFd;
		}
	}
	return ::open(normalized.c_str(), flags, mode);
}

static inline int WasmIoRead(int fd, void *buffer, unsigned int length)
{
	if (cnc_port_opfs_intercept_is_fd && cnc_port_opfs_intercept_is_fd(fd)) {
		return cnc_port_opfs_intercept_read(fd, buffer, length);
	}
	return static_cast<int>(::read(fd, buffer, length));
}

static inline int WasmIoWrite(int fd, const void *buffer, unsigned int length)
{
	if (cnc_port_opfs_intercept_is_fd && cnc_port_opfs_intercept_is_fd(fd)) {
		// The OPFS layer is read-only; virtual fds are never handed out for
		// write-mode opens, so a write here is a caller bug.
		return -1;
	}
	return static_cast<int>(::write(fd, buffer, length));
}

static inline off_t WasmIoLseek(int fd, off_t offset, int whence)
{
	if (cnc_port_opfs_intercept_is_fd && cnc_port_opfs_intercept_is_fd(fd)) {
		return static_cast<off_t>(cnc_port_opfs_intercept_lseek(fd, offset, whence));
	}
	return ::lseek(fd, offset, whence);
}

static inline int WasmIoClose(int fd)
{
	if (cnc_port_opfs_intercept_is_fd && cnc_port_opfs_intercept_is_fd(fd)) {
		return cnc_port_opfs_intercept_close(fd);
	}
	return ::close(fd);
}

static inline int WasmIoAccess(const char *path, int mode)
{
	const std::string normalized = WasmIoNormalizePath(path);
	return ::access(normalized.c_str(), mode);
}

static inline int WasmIoChmod(const char *path, mode_t mode)
{
	const std::string normalized = WasmIoNormalizePath(path);
	return ::chmod(normalized.c_str(), mode);
}
#else
#define WASM_POSIX_SCOPE
#endif

#ifndef _O_RDONLY
#define _O_RDONLY O_RDONLY
#endif

#ifndef _O_WRONLY
#define _O_WRONLY O_WRONLY
#endif

#ifndef _O_RDWR
#define _O_RDWR O_RDWR
#endif

#ifndef _O_CREAT
#define _O_CREAT O_CREAT
#endif

#ifndef _O_TRUNC
#define _O_TRUNC O_TRUNC
#endif

#ifndef _O_APPEND
#define _O_APPEND O_APPEND
#endif

#ifndef _O_TEXT
#define _O_TEXT 0
#endif

#ifndef _O_BINARY
#define _O_BINARY 0
#endif

#ifndef _S_IREAD
#define _S_IREAD S_IRUSR
#endif

#ifndef _S_IWRITE
#define _S_IWRITE S_IWUSR
#endif

#ifndef _open
#ifdef __cplusplus
#define _open WasmIoOpen
#else
#define _open WASM_POSIX_SCOPE open
#endif
#endif

#ifndef _close
#ifdef __cplusplus
#define _close WasmIoClose
#else
#define _close WASM_POSIX_SCOPE close
#endif
#endif

#ifndef _read
#ifdef __cplusplus
#define _read WasmIoRead
#else
#define _read WASM_POSIX_SCOPE read
#endif
#endif

#ifndef _write
#ifdef __cplusplus
#define _write WasmIoWrite
#else
#define _write WASM_POSIX_SCOPE write
#endif
#endif

#ifndef _lseek
#ifdef __cplusplus
#define _lseek WasmIoLseek
#else
#define _lseek WASM_POSIX_SCOPE lseek
#endif
#endif

#ifndef _access
#ifdef __cplusplus
#define _access WasmIoAccess
#else
#define _access WASM_POSIX_SCOPE access
#endif
#endif

#ifndef _chmod
#ifdef __cplusplus
#define _chmod WasmIoChmod
#else
#define _chmod WASM_POSIX_SCOPE chmod
#endif
#endif
