#pragma once

#include <cstdarg>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <cwchar>
#include <cmath>
#include <dirent.h>
#include <fnmatch.h>
#include <mutex>
#include <string>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

#ifndef IN
#define IN
#endif

#ifndef OUT
#define OUT
#endif

#ifndef OPTIONAL
#define OPTIONAL
#endif

#ifndef FAR
#define FAR
#endif

#ifndef WINAPI
#define WINAPI
#endif

#ifndef __stdcall
#define __stdcall
#endif

using BYTE = unsigned char;
using BOOL = int;
using DWORD = unsigned long;
using HANDLE = void *;
using HGLOBAL = HANDLE;
using HKEY = void *;
using HINSTANCE = void *;
using HMODULE = HINSTANCE;
using FARPROC = void (*)();
using HACCEL = void *;
using HRSRC = void *;
using HIMC = void *;
using HKL = void *;
using HWND = void *;
using LONG = long;
using WCHAR = wchar_t;
using LPCSTR = const char *;
using LPCWSTR = const WCHAR *;
using LPCVOID = const void *;
using LPBYTE = BYTE *;
using LPDWORD = DWORD *;
using LPSTR = char *;
using LPVOID = void *;
using UINT = unsigned int;
using VOID = void;
using WPARAM = std::uintptr_t;
using LPARAM = std::intptr_t;
using WORD = unsigned short;

struct CRITICAL_SECTION
{
	std::recursive_mutex mutex;
};

struct LARGE_INTEGER
{
	long long QuadPart;
};

struct SYSTEMTIME
{
	WORD wYear;
	WORD wMonth;
	WORD wDayOfWeek;
	WORD wDay;
	WORD wHour;
	WORD wMinute;
	WORD wSecond;
	WORD wMilliseconds;
};

struct MEMORYSTATUS
{
	DWORD dwLength;
	DWORD dwMemoryLoad;
	DWORD dwTotalPhys;
	DWORD dwAvailPhys;
	DWORD dwTotalPageFile;
	DWORD dwAvailPageFile;
	DWORD dwTotalVirtual;
	DWORD dwAvailVirtual;
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

struct _EXCEPTION_POINTERS
{
	void *ExceptionRecord;
	void *ContextRecord;
};

using EXCEPTION_POINTERS = _EXCEPTION_POINTERS;

using _se_translator_function = void (*)(unsigned int, EXCEPTION_POINTERS *);

static inline _se_translator_function _set_se_translator(_se_translator_function translator)
{
	return translator;
}

struct ITEMIDLIST
{
	int unused;
};

using LPITEMIDLIST = ITEMIDLIST *;

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

#ifndef _isnan
#define _isnan std::isnan
#endif

#ifndef _MCW_RC
#define _MCW_RC 0x00000300
#endif

#ifndef _RC_NEAR
#define _RC_NEAR 0x00000000
#endif

#ifndef _MCW_PC
#define _MCW_PC 0x00030000
#endif

#ifndef _PC_24
#define _PC_24 0x00020000
#endif

static inline void _fpreset(void) {}
static inline unsigned int _statusfp(void) { return 0; }
static inline unsigned int _controlfp(unsigned int new_value, unsigned int mask)
{
	return new_value & mask;
}

#ifndef __min
#define __min(a, b) (((a) < (b)) ? (a) : (b))
#endif

#ifndef __max
#define __max(a, b) (((a) > (b)) ? (a) : (b))
#endif

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

#ifndef UNLEN
#define UNLEN 256
#endif

#ifndef MAX_COMPUTERNAME_LENGTH
#define MAX_COMPUTERNAME_LENGTH 15
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
#define CP_UTF8 65001
#define VK_RETURN 0x0D
#define WM_USER 0x0400
#define LOCALE_SYSTEM_DEFAULT 0x0800
#define DATE_SHORTDATE 0x00000001
#define TIME_NOSECONDS 0x00000002
#define TIME_NOTIMEMARKER 0x00000004
#define TIME_FORCE24HOURFORMAT 0x00000008
#define CSIDL_PERSONAL 0x0005
#define CSIDL_DESKTOPDIRECTORY 0x0010
#define FILE_ATTRIBUTE_READONLY 0x00000001
#define FILE_ATTRIBUTE_DIRECTORY 0x00000010
#define INVALID_FILE_ATTRIBUTES 0xffffffff
#define REG_OPTION_NON_VOLATILE 0x00000000
#define REG_SZ 1
#define REG_BINARY 3
#define REG_DWORD 4
#define VER_PLATFORM_WIN32s 0
#define VER_PLATFORM_WIN32_WINDOWS 1
#define VER_PLATFORM_WIN32_NT 2
#define HKEY_CURRENT_USER reinterpret_cast<HKEY>(0x80000001UL)
#define HKEY_LOCAL_MACHINE reinterpret_cast<HKEY>(0x80000002UL)
#define PM_NOREMOVE 0x0000
#define PM_REMOVE 0x0001
#define WM_CHAR 0x0102
#define WM_IME_SETCONTEXT 0x0281
#define WM_IME_NOTIFY 0x0282
#define WM_IME_CONTROL 0x0283
#define WM_IME_COMPOSITIONFULL 0x0284
#define WM_IME_SELECT 0x0285
#define WM_IME_CHAR 0x0286
#define WM_IME_REQUEST 0x0288
#define WM_IME_KEYDOWN 0x0290
#define WM_IME_KEYUP 0x0291
#define WM_IME_STARTCOMPOSITION 0x010D
#define WM_IME_ENDCOMPOSITION 0x010E
#define WM_IME_COMPOSITION 0x010F
#define WM_IME_KEYLAST 0x010F
#define IMN_CHANGECANDIDATE 0x0003
#define IMN_CLOSECANDIDATE 0x0004
#define IMN_OPENCANDIDATE 0x0005
#define IMN_SETCONVERSIONMODE 0x0006
#define IMN_SETSENTENCEMODE 0x0007
#define IMN_SETCANDIDATEPOS 0x0009
#define IMN_GUIDELINE 0x000D
#define IMC_GETCANDIDATEPOS 0x0007
#define IMC_SETCANDIDATEPOS 0x0008
#define IMR_CANDIDATEWINDOW 0x0001
#define ISC_SHOWUICANDIDATEWINDOW 0x00000001
#define GCS_COMPSTR 0x0008
#define GCS_CURSORPOS 0x0080
#define GCS_RESULTSTR 0x0800
#define CS_INSERTCHAR 0x2000
#define CS_NOMOVECARET 0x4000
#define IGP_PROPERTY 0x00000004
#define IME_CAND_UNKNOWN 0x0000
#define IME_CAND_READ 0x0001
#define IME_CAND_CODE 0x0002
#define IME_CAND_MEANING 0x0003
#define IME_CAND_RADICAL 0x0004
#define IME_CAND_STROKE 0x0005
#define IME_PROP_CANDLIST_START_FROM_1 0x00000004
#define IME_PROP_UNICODE 0x00080000

#ifndef _stat
#define _stat stat
#endif

#ifndef _S_IFDIR
#define _S_IFDIR S_IFDIR
#endif

struct FILETIME
{
	DWORD dwLowDateTime;
	DWORD dwHighDateTime;
};

struct OSVERSIONINFO
{
	DWORD dwOSVersionInfoSize;
	DWORD dwMajorVersion;
	DWORD dwMinorVersion;
	DWORD dwBuildNumber;
	DWORD dwPlatformId;
	char szCSDVersion[128];
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

struct CANDIDATELIST
{
	DWORD dwSize;
	DWORD dwStyle;
	DWORD dwCount;
	DWORD dwSelection;
	DWORD dwPageStart;
	DWORD dwPageSize;
	DWORD dwOffset[1];
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

static inline void GlobalMemoryStatus(MEMORYSTATUS *status)
{
	if (status == nullptr) {
		return;
	}

	std::memset(status, 0, sizeof(*status));
	status->dwLength = sizeof(*status);
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

static inline DWORD FormatMessageW(
	DWORD flags,
	LPCVOID source,
	DWORD id,
	DWORD language,
	WCHAR *buffer,
	DWORD buffer_len,
	void *arguments)
{
	if (buffer == nullptr || buffer_len == 0) {
		return 0;
	}

	char narrow[256];
	const DWORD written = FormatMessage(flags, source, id, language, narrow, sizeof(narrow), arguments);
	const DWORD count = written < buffer_len ? written : buffer_len - 1;
	for (DWORD index = 0; index < count; ++index) {
		buffer[index] = static_cast<WCHAR>(narrow[index]);
	}
	buffer[count] = 0;
	return count;
}

static inline int MessageBoxA(void *, const char *text, const char *caption, unsigned int)
{
	std::fprintf(stderr, "%s: %s\n", caption ? caption : "MessageBoxA", text ? text : "");
	return IDIGNORE;
}

static inline BOOL SetWindowText(HWND, const char *)
{
	return TRUE;
}

static inline BOOL SetWindowTextW(HWND, const wchar_t *)
{
	return TRUE;
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

static inline BOOL GetVersionEx(OSVERSIONINFO *info)
{
	if (info == nullptr) {
		return FALSE;
	}

	info->dwMajorVersion = 10;
	info->dwMinorVersion = 0;
	info->dwBuildNumber = 0;
	info->dwPlatformId = VER_PLATFORM_WIN32_NT;
	info->szCSDVersion[0] = '\0';
	return TRUE;
}

static inline int AddFontResource(LPCSTR)
{
	return 1;
}

static inline BOOL SHGetSpecialFolderPath(HWND, LPSTR path, int, BOOL)
{
	if (path == nullptr) {
		return FALSE;
	}

	const char *home = std::getenv("HOME");
	if (home == nullptr || *home == '\0') {
		home = ".";
	}
	std::snprintf(path, _MAX_PATH, "%s", home);
	return TRUE;
}

static inline BOOL SHGetSpecialFolderLocation(HWND, int, LPITEMIDLIST *pidl)
{
	if (pidl != nullptr) {
		static ITEMIDLIST desktop;
		*pidl = &desktop;
	}
	return TRUE;
}

static inline BOOL SHGetPathFromIDList(LPITEMIDLIST, LPSTR path)
{
	return SHGetSpecialFolderPath(nullptr, path, CSIDL_DESKTOPDIRECTORY, FALSE);
}

static inline BOOL WasmCopyWin32Identity(const char *value, LPSTR buffer, unsigned long *buffer_len)
{
	if (buffer == nullptr || buffer_len == nullptr || value == nullptr || *value == '\0') {
		return FALSE;
	}

	const std::size_t length = std::strlen(value);
	const unsigned long required = static_cast<unsigned long>(length + 1);
	if (*buffer_len < required) {
		*buffer_len = required;
		return FALSE;
	}

	std::memcpy(buffer, value, length + 1);
	*buffer_len = required;
	return TRUE;
}

static inline BOOL GetUserNameA(LPSTR buffer, unsigned long *buffer_len)
{
	const char *user = std::getenv("USER");
	if (user == nullptr || *user == '\0') {
		user = std::getenv("LOGNAME");
	}
	return WasmCopyWin32Identity(user, buffer, buffer_len);
}

static inline BOOL GetComputerNameA(LPSTR buffer, unsigned long *buffer_len)
{
	const char *host = std::getenv("HOSTNAME");
	return WasmCopyWin32Identity(host, buffer, buffer_len);
}

#ifndef GetUserName
#define GetUserName GetUserNameA
#endif

#ifndef GetComputerName
#define GetComputerName GetComputerNameA
#endif

static inline BOOL RemoveFontResource(LPCSTR)
{
	return TRUE;
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

static inline HKL GetKeyboardLayout(DWORD)
{
	return nullptr;
}

static inline HIMC ImmCreateContext()
{
	return nullptr;
}

static inline BOOL ImmDestroyContext(HIMC)
{
	return TRUE;
}

static inline HIMC ImmGetContext(HWND)
{
	return nullptr;
}

static inline BOOL ImmReleaseContext(HWND, HIMC)
{
	return TRUE;
}

static inline HIMC ImmAssociateContext(HWND, HIMC context)
{
	return context;
}

static inline BOOL ImmGetConversionStatus(HIMC, DWORD *conversion, DWORD *sentence)
{
	if (conversion != nullptr) {
		*conversion = 0;
	}
	if (sentence != nullptr) {
		*sentence = 0;
	}
	return TRUE;
}

static inline LONG ImmGetCompositionStringW(HIMC, DWORD, LPVOID, DWORD)
{
	return -1;
}

static inline LONG ImmGetCompositionStringA(HIMC, DWORD, LPVOID, DWORD)
{
	return -1;
}

static inline LONG ImmGetCompositionString(HIMC context, DWORD index, LPVOID buffer, DWORD buffer_len)
{
	return ImmGetCompositionStringA(context, index, buffer, buffer_len);
}

static inline DWORD ImmGetCandidateListCountW(HIMC, DWORD *list_count)
{
	if (list_count != nullptr) {
		*list_count = 0;
	}
	return 0;
}

static inline DWORD ImmGetCandidateListCountA(HIMC, DWORD *list_count)
{
	if (list_count != nullptr) {
		*list_count = 0;
	}
	return 0;
}

static inline DWORD ImmGetCandidateListW(HIMC, DWORD, CANDIDATELIST *, DWORD)
{
	return 0;
}

static inline DWORD ImmGetCandidateListA(HIMC, DWORD, CANDIDATELIST *, DWORD)
{
	return 0;
}

static inline DWORD ImmGetProperty(HKL, DWORD)
{
	return 0;
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

static inline HMODULE LoadLibraryA(LPCSTR)
{
	return nullptr;
}

static inline BOOL FreeLibrary(HMODULE)
{
	return TRUE;
}

static inline FARPROC GetProcAddress(HMODULE, LPCSTR)
{
	return nullptr;
}

#ifndef LoadLibrary
#define LoadLibrary LoadLibraryA
#endif

static inline DWORD GetTickCount()
{
	return static_cast<DWORD>(std::time(nullptr) * 1000);
}

static inline DWORD GetCurrentTime()
{
	return GetTickCount();
}

static inline void GetLocalTime(SYSTEMTIME *system_time)
{
	if (system_time == nullptr) {
		return;
	}

	const std::time_t now = std::time(nullptr);
	std::tm local = {};
#if defined(__EMSCRIPTEN__) || defined(__unix__) || defined(__APPLE__)
	localtime_r(&now, &local);
#else
	if (std::tm *tmp = std::localtime(&now)) {
		local = *tmp;
	}
#endif
	system_time->wYear = static_cast<WORD>(local.tm_year + 1900);
	system_time->wMonth = static_cast<WORD>(local.tm_mon + 1);
	system_time->wDayOfWeek = static_cast<WORD>(local.tm_wday);
	system_time->wDay = static_cast<WORD>(local.tm_mday);
	system_time->wHour = static_cast<WORD>(local.tm_hour);
	system_time->wMinute = static_cast<WORD>(local.tm_min);
	system_time->wSecond = static_cast<WORD>(local.tm_sec);
	system_time->wMilliseconds = 0;
}

static inline BOOL QueryPerformanceCounter(LARGE_INTEGER *counter)
{
	if (counter != nullptr) {
		counter->QuadPart = static_cast<long long>(GetTickCount());
	}
	return TRUE;
}

static inline BOOL QueryPerformanceFrequency(LARGE_INTEGER *frequency)
{
	if (frequency != nullptr) {
		frequency->QuadPart = 1000;
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

static inline DWORD GetCurrentDirectory(DWORD buffer_len, LPSTR buffer)
{
	if (buffer == nullptr || buffer_len == 0) {
		return 0;
	}

	char current[_MAX_PATH];
	if (getcwd(current, sizeof(current)) == nullptr) {
		return 0;
	}

	const std::size_t length = std::strlen(current);
	if (length + 1 > static_cast<std::size_t>(buffer_len)) {
		return static_cast<DWORD>(length + 1);
	}

	std::snprintf(buffer, static_cast<std::size_t>(buffer_len), "%s", current);
	return static_cast<DWORD>(length);
}

static inline BOOL SetCurrentDirectory(LPCSTR path)
{
	if (path == nullptr) {
		return FALSE;
	}

	const std::string normalized = WasmNormalizePath(path);
	return chdir(normalized.c_str()) == 0 ? TRUE : FALSE;
}

static inline int WasmFormatSystemDate(const SYSTEMTIME *time, char *buffer, int buffer_len)
{
	if (time == nullptr || buffer_len <= 0) {
		return 0;
	}
	return std::snprintf(
		buffer,
		static_cast<std::size_t>(buffer_len),
		"%04u-%02u-%02u",
		static_cast<unsigned>(time->wYear),
		static_cast<unsigned>(time->wMonth),
		static_cast<unsigned>(time->wDay));
}

static inline int WasmFormatSystemTime(const SYSTEMTIME *time, char *buffer, int buffer_len)
{
	if (time == nullptr || buffer_len <= 0) {
		return 0;
	}
	return std::snprintf(
		buffer,
		static_cast<std::size_t>(buffer_len),
		"%02u:%02u",
		static_cast<unsigned>(time->wHour),
		static_cast<unsigned>(time->wMinute));
}

static inline int GetDateFormat(
	DWORD,
	DWORD,
	const SYSTEMTIME *time,
	LPCSTR,
	LPSTR buffer,
	int buffer_len)
{
	return WasmFormatSystemDate(time, buffer, buffer_len);
}

static inline int GetTimeFormat(
	DWORD,
	DWORD,
	const SYSTEMTIME *time,
	LPCSTR,
	LPSTR buffer,
	int buffer_len)
{
	return WasmFormatSystemTime(time, buffer, buffer_len);
}

static inline int GetDateFormatW(
	DWORD,
	DWORD,
	const SYSTEMTIME *time,
	const WCHAR *,
	WCHAR *buffer,
	int buffer_len)
{
	char ascii[32];
	const int written = WasmFormatSystemDate(time, ascii, sizeof(ascii));
	if (written <= 0 || buffer == nullptr || buffer_len <= 0) {
		return written;
	}

	const int count = written < buffer_len ? written : buffer_len - 1;
	for (int index = 0; index < count; ++index) {
		buffer[index] = static_cast<WCHAR>(ascii[index]);
	}
	buffer[count] = 0;
	return count;
}

static inline int GetTimeFormatW(
	DWORD,
	DWORD,
	const SYSTEMTIME *time,
	const WCHAR *,
	WCHAR *buffer,
	int buffer_len)
{
	char ascii[32];
	const int written = WasmFormatSystemTime(time, ascii, sizeof(ascii));
	if (written <= 0 || buffer == nullptr || buffer_len <= 0) {
		return written;
	}

	const int count = written < buffer_len ? written : buffer_len - 1;
	for (int index = 0; index < count; ++index) {
		buffer[index] = static_cast<WCHAR>(ascii[index]);
	}
	buffer[count] = 0;
	return count;
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

static inline BOOL CopyFile(LPCSTR existing_filename, LPCSTR new_filename, BOOL fail_if_exists)
{
	if (existing_filename == nullptr || new_filename == nullptr) {
		return FALSE;
	}

	const std::string existing = WasmNormalizePath(existing_filename);
	const std::string replacement = WasmNormalizePath(new_filename);
	if (fail_if_exists) {
		struct stat attributes;
		if (stat(replacement.c_str(), &attributes) == 0) {
			return FALSE;
		}
	}

	FILE *source = std::fopen(existing.c_str(), "rb");
	if (source == nullptr) {
		return FALSE;
	}

	FILE *target = std::fopen(replacement.c_str(), "wb");
	if (target == nullptr) {
		std::fclose(source);
		return FALSE;
	}

	char buffer[8192];
	BOOL ok = TRUE;
	while (const std::size_t read = std::fread(buffer, 1, sizeof(buffer), source)) {
		if (std::fwrite(buffer, 1, read, target) != read) {
			ok = FALSE;
			break;
		}
	}
	if (std::ferror(source)) {
		ok = FALSE;
	}

	std::fclose(target);
	std::fclose(source);
	if (!ok) {
		std::remove(replacement.c_str());
	}
	return ok;
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

static inline UINT GetDoubleClickTime()
{
	return 500;
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
