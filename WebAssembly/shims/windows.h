#pragma once

#include <cstdarg>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cwchar>
#include <unistd.h>

using BOOL = int;
using DWORD = unsigned long;
using HANDLE = void *;
using LPCVOID = const void *;
using LPDWORD = DWORD *;
using LPSTR = char *;
using LPVOID = void *;
using WCHAR = wchar_t;

#ifndef FALSE
#define FALSE 0
#endif

#ifndef TRUE
#define TRUE 1
#endif

#ifndef NULL
#define NULL 0
#endif

#define FORMAT_MESSAGE_FROM_SYSTEM 0x00001000

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
