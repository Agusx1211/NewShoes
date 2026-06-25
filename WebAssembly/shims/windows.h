#pragma once

#include <cstdarg>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <cwchar>
#include <dirent.h>
#include <fnmatch.h>
#include <mutex>
#include <string>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

using BYTE = unsigned char;
using BOOL = int;
using DWORD = unsigned long;
using HANDLE = void *;
using HGLOBAL = HANDLE;
using HKEY = void *;
using HINSTANCE = void *;
using HMODULE = HINSTANCE;
using HACCEL = void *;
using HRSRC = void *;
using HWND = void *;
using LONG = long;
using LPCSTR = const char *;
using LPCVOID = const void *;
using LPBYTE = BYTE *;
using LPDWORD = DWORD *;
using LPSTR = char *;
using LPVOID = void *;
using UINT = unsigned int;
using WPARAM = std::uintptr_t;
using LPARAM = std::intptr_t;
using WCHAR = wchar_t;
using WORD = unsigned short;

struct CRITICAL_SECTION
{
	std::recursive_mutex mutex;
};

struct LARGE_INTEGER
{
	long long QuadPart;
};

struct POINT
{
	long x;
	long y;
};

struct MSG
{
	HWND hwnd;
	UINT message;
	WPARAM wParam;
	LPARAM lParam;
	DWORD time;
	POINT pt;
};

#ifndef FALSE
#define FALSE 0
#endif

#ifndef TRUE
#define TRUE 1
#endif

#ifdef NULL
#undef NULL
#endif
#define NULL 0

#ifndef INVALID_HANDLE_VALUE
#define INVALID_HANDLE_VALUE reinterpret_cast<HANDLE>(-1)
#endif

#define FORMAT_MESSAGE_FROM_SYSTEM 0x00001000

#define GMEM_MOVEABLE 0x0002
#define GMEM_FIXED 0x0000

#ifndef _MAX_PATH
#define _MAX_PATH 260
#endif

#ifndef _MAX_DRIVE
#define _MAX_DRIVE 3
#endif

#ifndef _MAX_DIR
#define _MAX_DIR 256
#endif

#ifndef _MAX_FNAME
#define _MAX_FNAME 256
#endif

#ifndef _MAX_EXT
#define _MAX_EXT 256
#endif

#define MB_ABORTRETRYIGNORE 0x00000002
#define MB_ICONHAND 0x00000010
#define MB_SETFOREGROUND 0x00010000
#define MB_TASKMODAL 0x00002000

#define IDABORT 3
#define IDRETRY 4
#define IDIGNORE 5

#define EVENT_MODIFY_STATE 0x0002
#define KEY_READ 0x20019
#define KEY_WRITE 0x20006
#define KEY_ALL_ACCESS 0xf003f
#define PAGE_READWRITE 0x04
#define FILE_MAP_WRITE 0x0002
#define WAIT_OBJECT_0 0x00000000
#define INFINITE 0xffffffff
#define ERROR_SUCCESS 0
#define ERROR_FILE_NOT_FOUND 2
#define ERROR_ALREADY_EXISTS 183
#define ERROR_NO_MORE_ITEMS 259
#define CP_ACP 0
#define FILE_ATTRIBUTE_READONLY 0x00000001
#define FILE_ATTRIBUTE_DIRECTORY 0x00000010
#define INVALID_FILE_ATTRIBUTES 0xffffffff
#define REG_OPTION_NON_VOLATILE 0x00000000
#define REG_SZ 1
#define REG_BINARY 3
#define REG_DWORD 4
#define HKEY_CURRENT_USER reinterpret_cast<HKEY>(0x80000001UL)
#define HKEY_LOCAL_MACHINE reinterpret_cast<HKEY>(0x80000002UL)
#define PM_NOREMOVE 0x0000
#define PM_REMOVE 0x0001

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

struct WIN32_FIND_DATA
{
	DWORD dwFileAttributes;
	FILETIME ftCreationTime;
	FILETIME ftLastAccessTime;
	FILETIME ftLastWriteTime;
	DWORD nFileSizeHigh;
	DWORD nFileSizeLow;
	char cFileName[_MAX_PATH];
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

static inline void InitializeCriticalSection(CRITICAL_SECTION *)
{
}

static inline void DeleteCriticalSection(CRITICAL_SECTION *)
{
}

static inline void EnterCriticalSection(CRITICAL_SECTION *section)
{
	if (section != nullptr) {
		section->mutex.lock();
	}
}

static inline void LeaveCriticalSection(CRITICAL_SECTION *section)
{
	if (section != nullptr) {
		section->mutex.unlock();
	}
}

static inline long InterlockedIncrement(long *value)
{
	return __atomic_add_fetch(value, 1L, __ATOMIC_SEQ_CST);
}

static inline long InterlockedDecrement(long *value)
{
	return __atomic_sub_fetch(value, 1L, __ATOMIC_SEQ_CST);
}

static inline DWORD GetCurrentThreadId()
{
	return 1;
}

static inline void Sleep(DWORD milliseconds)
{
	if (milliseconds == 0) {
		return;
	}
	usleep(static_cast<useconds_t>(milliseconds) * 1000U);
}

static inline BOOL PeekMessage(MSG *, HWND, UINT, UINT, UINT)
{
	return FALSE;
}

static inline BOOL GetMessage(MSG *, HWND, UINT, UINT)
{
	return FALSE;
}

static inline BOOL TranslateAccelerator(HWND, HACCEL, MSG *)
{
	return FALSE;
}

static inline BOOL IsDialogMessage(HWND, MSG *)
{
	return FALSE;
}

static inline BOOL TranslateMessage(const MSG *)
{
	return TRUE;
}

static inline LONG DispatchMessage(const MSG *)
{
	return 0;
}

static inline DWORD GetModuleFileNameA(HINSTANCE, LPSTR buffer, DWORD size)
{
	if (buffer == nullptr || size == 0) {
		return 0;
	}

	const char fallback[] = "cnc-port.exe";
	const char *path = fallback;
#if defined(__linux__) || defined(__EMSCRIPTEN__)
	char resolved[_MAX_PATH];
	const ssize_t length = readlink("/proc/self/exe", resolved, sizeof(resolved) - 1);
	if (length > 0) {
		resolved[length] = '\0';
		path = resolved;
	}
#endif
	const std::size_t path_length = std::strlen(path);
	const std::size_t copy_length = path_length < static_cast<std::size_t>(size - 1) ?
		path_length :
		static_cast<std::size_t>(size - 1);
	std::memcpy(buffer, path, copy_length);
	buffer[copy_length] = '\0';
	return static_cast<DWORD>(copy_length);
}

#ifndef GetModuleFileName
#define GetModuleFileName GetModuleFileNameA
#endif

static inline DWORD GetTickCount()
{
	return static_cast<DWORD>(std::time(nullptr) * 1000);
}

static inline BOOL QueryPerformanceCounter(LARGE_INTEGER *counter)
{
	if (counter != nullptr) {
		counter->QuadPart = static_cast<long long>(GetTickCount());
	}
	return TRUE;
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
	if (S_ISDIR(attributes.st_mode)) {
		flags |= FILE_ATTRIBUTE_DIRECTORY;
	}
	return flags;
}

struct WasmFindHandle
{
	DIR *directory;
	std::string directory_name;
	std::string pattern;
};

static inline std::string WasmNormalizePath(const char *path)
{
	std::string normalized = path != nullptr ? path : "";
	for (char &ch : normalized) {
		if (ch == '\\') {
			ch = '/';
		}
	}
	return normalized;
}

static inline void WasmSplitFindPattern(const char *search, std::string &directory, std::string &pattern)
{
	const std::string normalized = WasmNormalizePath(search);
	const std::size_t slash = normalized.find_last_of('/');
	if (slash == std::string::npos) {
		directory = ".";
		pattern = normalized;
	} else {
		directory = slash == 0 ? "/" : normalized.substr(0, slash);
		pattern = normalized.substr(slash + 1);
	}

	if (pattern.empty() || pattern == "*.") {
		pattern = "*";
	}
}

static inline BOOL WasmPopulateFindData(WasmFindHandle *handle, WIN32_FIND_DATA *data)
{
	if (handle == nullptr || handle->directory == nullptr || data == nullptr) {
		return FALSE;
	}

	while (dirent *entry = readdir(handle->directory)) {
		if (fnmatch(handle->pattern.c_str(), entry->d_name, 0) != 0) {
			continue;
		}

		const std::string path = handle->directory_name == "." ?
			std::string(entry->d_name) :
			handle->directory_name + "/" + entry->d_name;
		struct stat attributes;
		if (stat(path.c_str(), &attributes) != 0) {
			continue;
		}

		std::memset(data, 0, sizeof(*data));
		if (S_ISDIR(attributes.st_mode)) {
			data->dwFileAttributes |= FILE_ATTRIBUTE_DIRECTORY;
		}
		if ((attributes.st_mode & S_IWUSR) == 0) {
			data->dwFileAttributes |= FILE_ATTRIBUTE_READONLY;
		}
		const unsigned long long size = static_cast<unsigned long long>(attributes.st_size);
		data->nFileSizeHigh = static_cast<DWORD>(size >> 32);
		data->nFileSizeLow = static_cast<DWORD>(size & 0xffffffffUL);
		data->ftLastWriteTime.dwLowDateTime = static_cast<DWORD>(attributes.st_mtime);
		std::snprintf(data->cFileName, sizeof(data->cFileName), "%s", entry->d_name);
		return TRUE;
	}

	return FALSE;
}

static inline HANDLE FindFirstFile(LPCSTR search, WIN32_FIND_DATA *data)
{
	std::string directory;
	std::string pattern;
	WasmSplitFindPattern(search, directory, pattern);

	DIR *dir = opendir(directory.c_str());
	if (dir == nullptr) {
		return INVALID_HANDLE_VALUE;
	}

	WasmFindHandle *handle = new WasmFindHandle{ dir, directory, pattern };
	if (!WasmPopulateFindData(handle, data)) {
		closedir(dir);
		delete handle;
		return INVALID_HANDLE_VALUE;
	}
	return static_cast<HANDLE>(handle);
}

static inline BOOL FindNextFile(HANDLE find_handle, WIN32_FIND_DATA *data)
{
	return WasmPopulateFindData(static_cast<WasmFindHandle *>(find_handle), data);
}

static inline BOOL FindClose(HANDLE find_handle)
{
	if (find_handle == nullptr || find_handle == INVALID_HANDLE_VALUE) {
		return FALSE;
	}
	WasmFindHandle *handle = static_cast<WasmFindHandle *>(find_handle);
	if (handle->directory != nullptr) {
		closedir(handle->directory);
	}
	delete handle;
	return TRUE;
}

static inline BOOL CreateDirectory(LPCSTR path, void *)
{
	if (path == nullptr || *path == '\0') {
		return FALSE;
	}

	const std::string normalized = WasmNormalizePath(path);
	if (mkdir(normalized.c_str(), 0777) == 0) {
		return TRUE;
	}

	struct stat attributes;
	return stat(normalized.c_str(), &attributes) == 0 && S_ISDIR(attributes.st_mode) ? TRUE : FALSE;
}

static inline BOOL DeleteFile(LPCSTR filename)
{
	return filename != nullptr && remove(filename) == 0 ? TRUE : FALSE;
}

static inline BOOL MoveFile(LPCSTR existing_filename, LPCSTR new_filename)
{
	return existing_filename != nullptr &&
		new_filename != nullptr &&
		rename(existing_filename, new_filename) == 0 ? TRUE : FALSE;
}

static inline void _splitpath(
	const char *path,
	char *drive,
	char *dir,
	char *fname,
	char *ext)
{
	if (drive != nullptr) {
		drive[0] = '\0';
	}

	const std::string normalized = WasmNormalizePath(path);
	const std::size_t slash = normalized.find_last_of('/');
	const std::string directory = slash == std::string::npos ?
		std::string() :
		normalized.substr(0, slash + 1);
	const std::string leaf = slash == std::string::npos ?
		normalized :
		normalized.substr(slash + 1);
	const std::size_t dot = leaf.find_last_of('.');

	if (dir != nullptr) {
		std::snprintf(dir, _MAX_DIR, "%s", directory.c_str());
	}
	if (fname != nullptr) {
		const std::string stem = dot == std::string::npos ? leaf : leaf.substr(0, dot);
		std::snprintf(fname, _MAX_FNAME, "%s", stem.c_str());
	}
	if (ext != nullptr) {
		const std::string suffix = dot == std::string::npos ? std::string() : leaf.substr(dot);
		std::snprintf(ext, _MAX_EXT, "%s", suffix.c_str());
	}
}

static inline int LoadString(HINSTANCE, UINT, LPSTR, int)
{
	return 0;
}

static inline HRSRC FindResource(HMODULE, LPCSTR, LPCSTR)
{
	return nullptr;
}

static inline HGLOBAL LoadResource(HMODULE, HRSRC)
{
	return nullptr;
}

static inline LPVOID LockResource(HGLOBAL)
{
	return nullptr;
}

static inline DWORD SizeofResource(HMODULE, HRSRC)
{
	return 0;
}

static inline HANDLE OpenEvent(DWORD, BOOL, const char *)
{
	return nullptr;
}

static inline BOOL CloseHandle(HANDLE)
{
	return TRUE;
}

static inline LONG RegOpenKeyEx(HKEY, LPCSTR, DWORD, DWORD, HKEY *result)
{
	if (result != nullptr) {
		*result = nullptr;
	}
	return ERROR_FILE_NOT_FOUND;
}

static inline LONG RegQueryValueEx(HKEY, LPCSTR, LPDWORD, LPDWORD, unsigned char *, LPDWORD)
{
	return ERROR_FILE_NOT_FOUND;
}

static inline LONG RegCloseKey(HKEY)
{
	return ERROR_SUCCESS;
}

static inline LONG RegCreateKeyEx(HKEY, LPCSTR, DWORD, LPCSTR, DWORD, DWORD, void *, HKEY *result, LPDWORD disposition)
{
	if (result != nullptr) {
		*result = nullptr;
	}
	if (disposition != nullptr) {
		*disposition = 0;
	}
	return ERROR_FILE_NOT_FOUND;
}

static inline LONG RegSetValueEx(HKEY, LPCSTR, DWORD, DWORD, const unsigned char *, DWORD)
{
	return ERROR_FILE_NOT_FOUND;
}

static inline LONG RegQueryValueExW(HKEY, const WCHAR *, LPDWORD, LPDWORD, unsigned char *, LPDWORD)
{
	return ERROR_FILE_NOT_FOUND;
}

static inline LONG RegSetValueExW(HKEY, const WCHAR *, DWORD, DWORD, const unsigned char *, DWORD)
{
	return ERROR_FILE_NOT_FOUND;
}

static inline LONG RegEnumValue(
	HKEY,
	DWORD,
	LPSTR,
	LPDWORD,
	LPDWORD,
	LPDWORD,
	unsigned char *,
	LPDWORD)
{
	return ERROR_NO_MORE_ITEMS;
}

static inline LONG RegDeleteValue(HKEY, LPCSTR)
{
	return ERROR_FILE_NOT_FOUND;
}

static inline LONG RegEnumKeyEx(
	HKEY,
	DWORD,
	LPSTR,
	LPDWORD,
	LPDWORD,
	LPSTR,
	LPDWORD,
	FILETIME *)
{
	return ERROR_NO_MORE_ITEMS;
}

static inline LONG RegQueryInfoKey(
	HKEY,
	LPSTR,
	LPDWORD,
	LPDWORD,
	LPDWORD sub_keys,
	LPDWORD,
	LPDWORD,
	LPDWORD values,
	LPDWORD,
	LPDWORD,
	LPDWORD,
	FILETIME *)
{
	if (sub_keys != nullptr) {
		*sub_keys = 0;
	}
	if (values != nullptr) {
		*values = 0;
	}
	return ERROR_FILE_NOT_FOUND;
}

static inline LONG RegDeleteKey(HKEY, LPCSTR)
{
	return ERROR_FILE_NOT_FOUND;
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

static inline constexpr std::size_t GlobalAllocHeaderSize()
{
	return (sizeof(std::size_t) + alignof(std::max_align_t) - 1) &
		~(alignof(std::max_align_t) - 1);
}

static inline HANDLE GlobalAlloc(UINT, std::size_t bytes)
{
	const std::size_t total_size = GlobalAllocHeaderSize() + bytes;
	auto *base = static_cast<unsigned char *>(std::malloc(total_size));
	if (base == nullptr) {
		return nullptr;
	}
	*reinterpret_cast<std::size_t *>(base) = bytes;
	return base + GlobalAllocHeaderSize();
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
	if (handle != nullptr) {
		auto *base = static_cast<unsigned char *>(handle) - GlobalAllocHeaderSize();
		std::free(base);
	}
	return nullptr;
}

static inline std::size_t GlobalSize(HANDLE handle)
{
	if (handle == nullptr) {
		return 0;
	}
	const auto *base = static_cast<const unsigned char *>(handle) - GlobalAllocHeaderSize();
	return *reinterpret_cast<const std::size_t *>(base);
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
