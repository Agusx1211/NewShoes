#pragma once

#include <cstdarg>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cwchar>
#include <sys/stat.h>
#include <unistd.h>

using BYTE = unsigned char;
using BOOL = int;
using DWORD = unsigned long;
using HANDLE = void *;
using HINSTANCE = void *;
using HWND = void *;
using LPCSTR = const char *;
using LPCVOID = const void *;
using LPDWORD = DWORD *;
using LPSTR = char *;
using LPVOID = void *;
using UINT = unsigned int;
using WCHAR = wchar_t;
using WORD = unsigned short;

#ifndef FALSE
#define FALSE 0
#endif

#ifndef TRUE
#define TRUE 1
#endif

#ifndef NULL
#define NULL 0
#endif

#ifndef INVALID_HANDLE_VALUE
#define INVALID_HANDLE_VALUE reinterpret_cast<HANDLE>(-1)
#endif

#define FORMAT_MESSAGE_FROM_SYSTEM 0x00001000

#define GMEM_MOVEABLE 0x0002

#define MB_ABORTRETRYIGNORE 0x00000002
#define MB_ICONHAND 0x00000010
#define MB_SETFOREGROUND 0x00010000
#define MB_TASKMODAL 0x00002000

#define IDABORT 3
#define IDRETRY 4
#define IDIGNORE 5

#define EVENT_MODIFY_STATE 0x0002
#define PAGE_READWRITE 0x04
#define FILE_MAP_WRITE 0x0002
#define WAIT_OBJECT_0 0x00000000
#define INFINITE 0xffffffff
#define CP_ACP 0
#define FILE_ATTRIBUTE_READONLY 0x00000001
#define INVALID_FILE_ATTRIBUTES 0xffffffff

struct FILETIME
{
	DWORD dwLowDateTime;
	DWORD dwHighDateTime;
};

struct VS_FIXEDFILEINFO
{
	DWORD dwSignature;
	DWORD dwStrucVersion;
	DWORD dwFileVersionMS;
	DWORD dwFileVersionLS;
	DWORD dwProductVersionMS;
	DWORD dwProductVersionLS;
	DWORD dwFileFlagsMask;
	DWORD dwFileFlags;
	DWORD dwFileOS;
	DWORD dwFileType;
	DWORD dwFileSubtype;
	DWORD dwFileDateMS;
	DWORD dwFileDateLS;
};

struct IMAGE_DOS_HEADER
{
	WORD e_magic;
	WORD e_cblp;
	WORD e_cp;
	WORD e_crlc;
	WORD e_cparhdr;
	WORD e_minalloc;
	WORD e_maxalloc;
	WORD e_ss;
	WORD e_sp;
	WORD e_csum;
	WORD e_ip;
	WORD e_cs;
	WORD e_lfarlc;
	WORD e_ovno;
	WORD e_res[4];
	WORD e_oemid;
	WORD e_oeminfo;
	WORD e_res2[10];
	long e_lfanew;
};

struct IMAGE_FILE_HEADER
{
	WORD Machine;
	WORD NumberOfSections;
	DWORD TimeDateStamp;
	DWORD PointerToSymbolTable;
	DWORD NumberOfSymbols;
	WORD SizeOfOptionalHeader;
	WORD Characteristics;
};

using PIMAGE_DOS_HEADER = IMAGE_DOS_HEADER *;
using PIMAGE_FILE_HEADER = IMAGE_FILE_HEADER *;

static_assert(sizeof(IMAGE_DOS_HEADER) == 64, "IMAGE_DOS_HEADER must match PE layout");
static_assert(sizeof(IMAGE_FILE_HEADER) == 20, "IMAGE_FILE_HEADER must match PE layout");

static inline DWORD GetLastError()
{
	return 0;
}

static inline DWORD FormatMessage(
	DWORD,
	LPCVOID,
	DWORD id,
	DWORD,
	LPSTR buffer,
	DWORD buffer_len,
	void *)
{
	if (buffer == nullptr || buffer_len == 0) {
		return 0;
	}

	const int written = std::snprintf(
		buffer,
		static_cast<std::size_t>(buffer_len),
		"wasm platform error %u",
		static_cast<unsigned>(id));
	return written > 0 ? static_cast<DWORD>(written) : 0;
}

static inline int MessageBoxA(void *, const char *text, const char *caption, unsigned int)
{
	std::fprintf(stderr, "%s: %s\n", caption ? caption : "MessageBoxA", text ? text : "");
	return IDIGNORE;
}

static inline void ExitProcess(unsigned int code)
{
	std::exit(static_cast<int>(code));
}

static inline void DebugBreak()
{
	__builtin_trap();
}

static inline DWORD GetFileAttributes(LPCSTR filename)
{
	if (filename == nullptr) {
		return INVALID_FILE_ATTRIBUTES;
	}

	struct stat attributes;
	if (stat(filename, &attributes) != 0) {
		return INVALID_FILE_ATTRIBUTES;
	}

	DWORD flags = 0;
	if ((attributes.st_mode & S_IWUSR) == 0) {
		flags |= FILE_ATTRIBUTE_READONLY;
	}
	return flags;
}

static inline BOOL DeleteFile(LPCSTR filename)
{
	return filename != nullptr && remove(filename) == 0 ? TRUE : FALSE;
}

static inline HANDLE OpenEvent(DWORD, BOOL, const char *)
{
	return nullptr;
}

static inline BOOL CloseHandle(HANDLE)
{
	return TRUE;
}

static inline HANDLE CreateFileMapping(HANDLE, void *, DWORD, DWORD, DWORD, const char *)
{
	return nullptr;
}

static inline LPVOID MapViewOfFile(HANDLE, DWORD, DWORD, DWORD, std::size_t)
{
	return nullptr;
}

static inline DWORD WaitForSingleObject(HANDLE, DWORD)
{
	return WAIT_OBJECT_0;
}

static inline BOOL SetEvent(HANDLE)
{
	return TRUE;
}

static inline HANDLE GlobalAlloc(UINT, std::size_t bytes)
{
	return std::malloc(bytes);
}

static inline LPVOID GlobalLock(HANDLE handle)
{
	return handle;
}

static inline BOOL GlobalUnlock(HANDLE)
{
	return TRUE;
}

static inline HANDLE GlobalFree(HANDLE handle)
{
	std::free(handle);
	return nullptr;
}

static inline DWORD GetFileVersionInfoSize(LPCSTR, LPDWORD handle)
{
	if (handle != nullptr) {
		*handle = 0;
	}
	return 0;
}

static inline BOOL GetFileVersionInfo(LPCSTR, DWORD, DWORD, LPVOID)
{
	return FALSE;
}

static inline BOOL VerQueryValue(LPCVOID, LPCSTR, LPVOID *, UINT *)
{
	return FALSE;
}

static inline BOOL GetFileTime(HANDLE, FILETIME *, FILETIME *, FILETIME *write_time)
{
	if (write_time != nullptr) {
		write_time->dwLowDateTime = 0;
		write_time->dwHighDateTime = 0;
	}
	return FALSE;
}

static inline int wsprintf(char *buffer, const char *format, ...)
{
	va_list args;
	va_start(args, format);
	const int result = std::vsprintf(buffer, format, args);
	va_end(args);
	return result;
}

static inline int WideCharToMultiByte(
	unsigned int,
	DWORD,
	const WCHAR *source,
	int source_len,
	LPSTR dest,
	int dest_len,
	const char *,
	BOOL *used_default_char)
{
	if (source == nullptr) {
		return 0;
	}

	const bool include_null = source_len == -1;
	const int input_len = include_null ? static_cast<int>(std::wcslen(source)) + 1 : source_len;
	if (input_len < 0) {
		return 0;
	}

	BOOL unmapped = FALSE;
	for (int index = 0; index < input_len; ++index) {
		if (static_cast<unsigned long>(source[index]) > 0x7fUL) {
			unmapped = TRUE;
			break;
		}
	}

	if (dest == nullptr || dest_len == 0) {
		if (used_default_char != nullptr) {
			*used_default_char = unmapped;
		}
		return input_len;
	}

	int written = 0;
	for (; written < input_len && written < dest_len; ++written) {
		const WCHAR ch = source[written];
		if (static_cast<unsigned long>(ch) <= 0x7fUL) {
			dest[written] = static_cast<char>(ch);
		} else {
			dest[written] = '?';
		}
		if (include_null && ch == 0) {
			++written;
			break;
		}
	}

	if (used_default_char != nullptr) {
		*used_default_char = unmapped;
	}
	return written;
}
