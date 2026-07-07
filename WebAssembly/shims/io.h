#pragma once

#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>

#ifdef __cplusplus
#include <string>
#define WASM_POSIX_SCOPE ::

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
	return ::open(normalized.c_str(), flags, mode);
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
#define _close WASM_POSIX_SCOPE close
#endif

#ifndef _read
#define _read WASM_POSIX_SCOPE read
#endif

#ifndef _write
#define _write WASM_POSIX_SCOPE write
#endif

#ifndef _lseek
#define _lseek WASM_POSIX_SCOPE lseek
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
