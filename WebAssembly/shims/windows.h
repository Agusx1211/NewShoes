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

#if defined(__EMSCRIPTEN__)
#include <emscripten/emscripten.h>
#include <emscripten/heap.h>
#endif

#ifndef IN
#define IN
#endif

#ifndef OUT
#define OUT
#endif

#ifndef OPTIONAL
#define OPTIONAL
#endif

#ifndef CONST
#define CONST const
#endif

#ifndef FAR
#define FAR
#endif

#ifndef WINAPI
#define WINAPI
#endif

#ifndef CALLBACK
#define CALLBACK WINAPI
#endif

#ifndef APIENTRY
#define APIENTRY WINAPI
#endif

#ifndef __stdcall
#define __stdcall
#endif

using BYTE = unsigned char;
using BOOL = int;
using DWORD = unsigned long;
using FLOAT = float;
using ULONG = unsigned long;
using SHORT = short;
using HANDLE = void *;
using HGLOBAL = HANDLE;
using HLOCAL = HGLOBAL;
using HKEY = void *;
using HINSTANCE = void *;
using HMODULE = HINSTANCE;
using HBITMAP = void *;
using HBRUSH = void *;
using HDC = void *;
using HCURSOR = void *;
using HFONT = void *;
using HGDIOBJ = void *;
using HICON = void *;
using HMENU = void *;
using FARPROC = void (*)();
using HACCEL = void *;
using HRSRC = void *;
using HIMC = void *;
using HKL = void *;
using HWND = void *;
struct IDispatch;
using LPDISPATCH = IDispatch *;
using LONG = long;
using LRESULT = LONG;
using HRESULT = LONG;
using WCHAR = wchar_t;
using LPCSTR = const char *;
using LPCWSTR = const WCHAR *;
using LPCVOID = const void *;
using PBYTE = BYTE *;
using LPBYTE = BYTE *;
using LPDWORD = DWORD *;
using LPSTR = char *;
using TCHAR = char;
using LPCTSTR = const char *;
using LPTSTR = char *;
using LPVOID = void *;
using UINT = unsigned int;
using COLORREF = DWORD;
using VOID = void;
using WPARAM = std::uintptr_t;
using LPARAM = std::intptr_t;
using WORD = unsigned short;
using LPWORD = WORD *;
using ATOM = WORD;
using LPTHREAD_START_ROUTINE = DWORD (WINAPI *)(LPVOID);
using WNDPROC = LRESULT (CALLBACK *)(HWND, UINT, WPARAM, LPARAM);

struct GUID
{
	unsigned long Data1;
	unsigned short Data2;
	unsigned short Data3;
	unsigned char Data4[8];
};

#ifndef S_OK
#define S_OK static_cast<HRESULT>(0)
#endif

#ifndef S_FALSE
#define S_FALSE static_cast<HRESULT>(1)
#endif

#ifndef E_FAIL
#define E_FAIL static_cast<HRESULT>(0x80004005L)
#endif

#ifndef SEVERITY_ERROR
#define SEVERITY_ERROR 1
#endif

#ifndef FACILITY_ITF
#define FACILITY_ITF 4
#endif

#ifndef MAKE_HRESULT
#define MAKE_HRESULT(severity, facility, code) \
	static_cast<HRESULT>(((static_cast<unsigned long>(severity) & 0x1UL) << 31) | \
		((static_cast<unsigned long>(facility) & 0x7ffUL) << 16) | \
		(static_cast<unsigned long>(code) & 0xffffUL))
#endif

#ifndef SUCCEEDED
#define SUCCEEDED(hr) (static_cast<HRESULT>(hr) >= 0)
#endif

#ifndef FAILED
#define FAILED(hr) (static_cast<HRESULT>(hr) < 0)
#endif

#ifndef LOWORD
#define LOWORD(value) static_cast<WORD>(static_cast<DWORD>(value) & 0xffffUL)
#endif

#ifndef HIWORD
#define HIWORD(value) static_cast<WORD>((static_cast<DWORD>(value) >> 16) & 0xffffUL)
#endif

#ifndef MAKELPARAM
#define MAKELPARAM(low, high) static_cast<LPARAM>((static_cast<DWORD>(static_cast<WORD>(low)) & 0xffffUL) | \
	((static_cast<DWORD>(static_cast<WORD>(high)) & 0xffffUL) << 16))
#endif

#ifndef ZeroMemory
#define ZeroMemory(destination, length) std::memset((destination), 0, (length))
#endif

struct CRITICAL_SECTION
{
	std::recursive_mutex mutex;
};

union LARGE_INTEGER
{
	struct {
		DWORD LowPart;
		LONG HighPart;
	};
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

struct RECT
{
	long left;
	long top;
	long right;
	long bottom;
};

struct SIZE
{
	long cx;
	long cy;
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

struct WNDCLASSA
{
	UINT style;
	WNDPROC lpfnWndProc;
	int cbClsExtra;
	int cbWndExtra;
	HINSTANCE hInstance;
	HICON hIcon;
	HCURSOR hCursor;
	HBRUSH hbrBackground;
	LPCSTR lpszMenuName;
	LPCSTR lpszClassName;
};

#ifndef WNDCLASS
#define WNDCLASS WNDCLASSA
#endif

struct STARTUPINFOA
{
	DWORD cb;
};

#ifndef STARTUPINFO
#define STARTUPINFO STARTUPINFOA
#endif

struct PROCESS_INFORMATION
{
	HANDLE hProcess;
	HANDLE hThread;
	DWORD dwProcessId;
	DWORD dwThreadId;
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

static inline int _wtoi(const wchar_t *value)
{
	return value ? static_cast<int>(std::wcstol(value, nullptr, 10)) : 0;
}

static inline double Win32PortNowMilliseconds()
{
#if defined(__EMSCRIPTEN__)
	return emscripten_get_now();
#else
	return static_cast<double>(std::time(nullptr)) * 1000.0;
#endif
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
#define GMEM_ZEROINIT 0x0040
#define LMEM_FIXED 0x0000
#define LMEM_ZEROINIT 0x0040
#define LPTR (LMEM_FIXED | LMEM_ZEROINIT)
#define HEAP_ZERO_MEMORY 0x00000008

#define GENERIC_READ 0x80000000UL
#define GENERIC_WRITE 0x40000000UL
#define CREATE_ALWAYS 2
#define FILE_ATTRIBUTE_NORMAL 0x00000080UL

#ifndef _MAX_PATH
#define _MAX_PATH 260
#endif

#ifndef MAX_PATH
#define MAX_PATH _MAX_PATH
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

#define MB_OK 0x00000000
#define MB_OKCANCEL 0x00000001
#define MB_ABORTRETRYIGNORE 0x00000002
#define MB_YESNO 0x00000004
#define MB_ICONHAND 0x00000010
#define MB_ICONSTOP MB_ICONHAND
#define MB_ICONERROR MB_ICONHAND
#define MB_ICONWARNING 0x00000030
#define MB_ICONEXCLAMATION 0x00000030
#define MB_ICONINFORMATION 0x00000040
#define MB_DEFBUTTON3 0x00000200
#define MB_APPLMODAL 0x00000000
#define MB_SYSTEMMODAL 0x00001000
#define MB_TASKMODAL 0x00002000
#define MB_SETFOREGROUND 0x00010000

#define IDOK 1
#define IDCANCEL 2
#define IDABORT 3
#define IDRETRY 4
#define IDIGNORE 5
#define IDYES 6
#define IDNO 7

#define CS_HREDRAW 0x0002
#define CS_VREDRAW 0x0001
#define CS_DBLCLKS 0x0008
#define HWND_TOP reinterpret_cast<HWND>(0)
#define HWND_NOTOPMOST reinterpret_cast<HWND>(-2)
#define HWND_TOPMOST reinterpret_cast<HWND>(-1)
#define SWP_NOSIZE 0x0001
#define SWP_NOMOVE 0x0002
#define SWP_NOZORDER 0x0004
#define SW_HIDE 0
#define SW_SHOW 5
#define GWL_STYLE (-16)
#define GWL_WNDPROC (-4)
#define GWLP_WNDPROC GWL_WNDPROC
#define HTCLIENT 1

#define DRIVE_UNKNOWN 0
#define DRIVE_NO_ROOT_DIR 1
#define DRIVE_REMOVABLE 2
#define DRIVE_FIXED 3
#define DRIVE_REMOTE 4
#define DRIVE_CDROM 5
#define DRIVE_RAMDISK 6

#define EVENT_MODIFY_STATE 0x0002
#define KEY_READ 0x20019
#define KEY_WRITE 0x20006
#define KEY_ALL_ACCESS 0xf003f
#define PAGE_READWRITE 0x04
#define FILE_MAP_WRITE 0x0002
#define WAIT_OBJECT_0 0x00000000
#define WAIT_TIMEOUT 0x00000102
#define INFINITE 0xffffffff
#define ERROR_SUCCESS 0
#define ERROR_FILE_NOT_FOUND 2
#define ERROR_ALREADY_EXISTS 183
#define ERROR_NO_MORE_ITEMS 259
#define CP_ACP 0
#define CP_UTF8 65001
#define VK_LBUTTON 0x01
#define VK_RBUTTON 0x02
#define VK_MBUTTON 0x04
#define VK_BACK 0x08
#define VK_TAB 0x09
#define VK_RETURN 0x0D
#define VK_SHIFT 0x10
#define VK_CONTROL 0x11
#define VK_MENU 0x12
#define VK_CAPITAL 0x14
#define VK_ESCAPE 0x1B
#define VK_SPACE 0x20
#define VK_INSERT 0x2D
#define VK_DELETE 0x2E
#define VK_LEFT 0x25
#define VK_UP 0x26
#define VK_RIGHT 0x27
#define VK_DOWN 0x28
#define VK_F5 0x74
#define VK_F6 0x75
#define VK_F7 0x76
#define VK_F8 0x77
#define VK_F9 0x78
#define VK_F10 0x79
#define VK_F11 0x7A
#define VK_F12 0x7B
#define VK_NUMLOCK 0x90
#define VK_SCROLL 0x91
#define VK_NUMPAD0 0x60
#define VK_NUMPAD1 0x61
#define VK_NUMPAD2 0x62
#define VK_NUMPAD3 0x63
#define VK_NUMPAD4 0x64
#define VK_NUMPAD5 0x65
#define VK_NUMPAD6 0x66
#define VK_NUMPAD7 0x67
#define VK_NUMPAD8 0x68
#define VK_NUMPAD9 0x69
#define VK_MULTIPLY 0x6A
#define VK_ADD 0x6B
#define VK_SEPARATOR 0x6C
#define VK_SUBTRACT 0x6D
#define VK_DECIMAL 0x6E
#define VK_DIVIDE 0x6F
#define MAPVK_VK_TO_VSC 0
#define IDC_ARROW reinterpret_cast<LPCSTR>(32512)
#define IDC_CROSS reinterpret_cast<LPCSTR>(32515)
#define IDC_SIZEALL reinterpret_cast<LPCSTR>(32646)
#define WM_USER 0x0400
#define WM_NCHITTEST 0x0084
#define WM_POWERBROADCAST 0x0218
#define WM_SYSCOMMAND 0x0112
#define WM_QUERYENDSESSION 0x0011
#define WM_CLOSE 0x0010
#define WM_CREATE 0x0001
#define WM_DESTROY 0x0002
#define WM_SETFOCUS 0x0007
#define WM_KILLFOCUS 0x0008
#define WM_SIZE 0x0005
#define WM_ACTIVATEAPP 0x001C
#define WM_ACTIVATE 0x0006
#define WM_SETCURSOR 0x0020
#define WM_PAINT 0x000F
#define WM_ERASEBKGND 0x0014
#define SC_SIZE 0xF000
#define SC_MOVE 0xF010
#define SC_MAXIMIZE 0xF030
#define SC_KEYMENU 0xF100
#define SC_MONITORPOWER 0xF170
#define WA_INACTIVE 0
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
	#define BI_RGB 0L
	#define DIB_RGB_COLORS 0
	#define ETO_OPAQUE 0x0002
	#define DEFAULT_CHARSET 1
	#define OUT_DEFAULT_PRECIS 0
	#define CLIP_DEFAULT_PRECIS 0
	#define ANTIALIASED_QUALITY 4
	#define VARIABLE_PITCH 2
	#define FW_NORMAL 400
	#define FW_BOLD 700
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
#define WM_QUIT 0x0012
#define WM_KEYDOWN 0x0100
#define WM_KEYUP 0x0101
#define WM_CHAR 0x0102
#define WM_SYSKEYDOWN 0x0104
#define WM_SYSKEYUP 0x0105
#define WM_MOUSEMOVE 0x0200
#define WM_LBUTTONDOWN 0x0201
#define WM_LBUTTONUP 0x0202
#define WM_LBUTTONDBLCLK 0x0203
#define WM_RBUTTONDOWN 0x0204
#define WM_RBUTTONUP 0x0205
#define WM_RBUTTONDBLCLK 0x0206
#define WM_MBUTTONDOWN 0x0207
#define WM_MBUTTONUP 0x0208
#define WM_MBUTTONDBLCLK 0x0209
#define WM_MOUSEWHEEL 0x020A
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

#ifndef RGB
#define RGB(red, green, blue) \
	(static_cast<COLORREF>((static_cast<BYTE>(red)) | \
	(static_cast<WORD>(static_cast<BYTE>(green)) << 8) | \
	(static_cast<DWORD>(static_cast<BYTE>(blue)) << 16)))
#endif

struct RGBQUAD
{
	BYTE rgbBlue;
	BYTE rgbGreen;
	BYTE rgbRed;
	BYTE rgbReserved;
};

#ifndef WASM_WIN32_BITMAPINFOHEADER_DEFINED
#define WASM_WIN32_BITMAPINFOHEADER_DEFINED
struct BITMAPINFOHEADER
{
	DWORD biSize;
	LONG biWidth;
	LONG biHeight;
	WORD biPlanes;
	WORD biBitCount;
	DWORD biCompression;
	DWORD biSizeImage;
	LONG biXPelsPerMeter;
	LONG biYPelsPerMeter;
	DWORD biClrUsed;
	DWORD biClrImportant;
};
#endif

struct BITMAPINFO
{
	BITMAPINFOHEADER bmiHeader;
	RGBQUAD bmiColors[1];
};

using PBITMAPINFOHEADER = BITMAPINFOHEADER *;
using PBITMAPINFO = BITMAPINFO *;

struct __attribute__((packed)) BITMAPFILEHEADER
{
	WORD bfType;
	DWORD bfSize;
	WORD bfReserved1;
	WORD bfReserved2;
	DWORD bfOffBits;
};

struct TEXTMETRIC
{
	LONG tmHeight;
	LONG tmAscent;
	LONG tmDescent;
	LONG tmInternalLeading;
	LONG tmExternalLeading;
	LONG tmAveCharWidth;
	LONG tmMaxCharWidth;
	LONG tmWeight;
	LONG tmOverhang;
	LONG tmDigitizedAspectX;
	LONG tmDigitizedAspectY;
	WCHAR tmFirstChar;
	WCHAR tmLastChar;
	WCHAR tmDefaultChar;
	WCHAR tmBreakChar;
	BYTE tmItalic;
	BYTE tmUnderlined;
	BYTE tmStruckOut;
	BYTE tmPitchAndFamily;
	BYTE tmCharSet;
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
#if defined(__EMSCRIPTEN__)
	const std::size_t heap_size = emscripten_get_heap_size();
	const std::size_t heap_max = emscripten_get_heap_max();
	const uintptr_t *sbrk_ptr = emscripten_get_sbrk_ptr();
	const std::size_t dynamic_top = sbrk_ptr != nullptr ? static_cast<std::size_t>(*sbrk_ptr) : 0;
	const std::size_t physical_available = dynamic_top < heap_size ? heap_size - dynamic_top : 0;
	const std::size_t virtual_total = heap_max > 0 ? heap_max : heap_size;
	const std::size_t virtual_available = dynamic_top < virtual_total ? virtual_total - dynamic_top : physical_available;
	const std::size_t dword_max = static_cast<std::size_t>(~static_cast<DWORD>(0));
	const auto clamp_dword = [dword_max](std::size_t value) -> DWORD {
		return static_cast<DWORD>(value > dword_max ? dword_max : value);
	};

	status->dwMemoryLoad = heap_size > 0
		? static_cast<DWORD>((static_cast<std::uint64_t>(heap_size - physical_available) * 100ULL) / heap_size)
		: 0;
	status->dwTotalPhys = clamp_dword(heap_size);
	status->dwAvailPhys = clamp_dword(physical_available);
	status->dwTotalPageFile = clamp_dword(virtual_total);
	status->dwAvailPageFile = clamp_dword(virtual_available);
	status->dwTotalVirtual = clamp_dword(virtual_total);
	status->dwAvailVirtual = clamp_dword(virtual_available);
#endif
}

static inline HANDLE GetProcessHeap()
{
	return reinterpret_cast<HANDLE>(1);
}

static inline LPVOID HeapAlloc(HANDLE, DWORD flags, std::size_t bytes)
{
	return (flags & HEAP_ZERO_MEMORY) ? std::calloc(1, bytes) : std::malloc(bytes);
}

static inline BOOL HeapFree(HANDLE, DWORD, LPVOID memory)
{
	std::free(memory);
	return TRUE;
}

static inline HGLOBAL LocalAlloc(UINT flags, std::size_t bytes)
{
	return (flags & LMEM_ZEROINIT) ? std::calloc(1, bytes) : std::malloc(bytes);
}

static inline HGLOBAL LocalFree(HGLOBAL memory)
{
	std::free(memory);
	return nullptr;
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

static inline int MessageBoxW(void *, const wchar_t *text, const wchar_t *caption, unsigned int)
{
	std::fwprintf(stderr, L"%ls: %ls\n", caption ? caption : L"MessageBoxW", text ? text : L"");
	return IDIGNORE;
}

static inline int MessageBox(void *window, const char *text, const char *caption, unsigned int flags)
{
	return MessageBoxA(window, text, caption, flags);
}

static inline BOOL SetWindowPos(HWND, HWND, int, int, int, int, UINT)
{
	return TRUE;
}

static inline BOOL ClipCursor(const RECT *)
{
	return TRUE;
}

static inline BOOL ShowWindow(HWND, int)
{
	return TRUE;
}

#ifndef SEM_FAILCRITICALERRORS
#define SEM_FAILCRITICALERRORS 0x0001
#endif

static inline UINT SetErrorMode(UINT)
{
	return 0;
}

static inline BOOL SetWindowText(HWND, const char *)
{
	return TRUE;
}

static inline BOOL SetWindowTextW(HWND, const wchar_t *)
{
	return TRUE;
}

namespace WasmWin32Input
{
inline POINT cursor_position = {0, 0};
inline bool cursor_position_available = false;
inline HCURSOR current_cursor = nullptr;
inline HWND capture_window = nullptr;
inline bool key_down[256] = {};
inline bool key_pressed_since_last_query[256] = {};
inline MSG message_queue[256] = {};
inline unsigned int message_queue_count = 0;
inline bool message_queue_overflowed = false;
inline MSG keyboard_message_queue[256] = {};
inline unsigned int keyboard_message_queue_count = 0;
inline bool keyboard_message_queue_overflowed = false;
inline unsigned int quit_message_posts = 0;
inline int last_quit_exit_code = 0;
struct WindowClassRecord
{
	LPCSTR name = nullptr;
	WNDPROC procedure = nullptr;
};
struct WindowRecord
{
	HWND handle = nullptr;
	LPCSTR class_name = nullptr;
	WNDPROC procedure = nullptr;
	RECT rect = {};
};
inline WindowClassRecord window_classes[32] = {};
inline unsigned int window_class_count = 0;
inline WindowRecord windows[32] = {};
inline unsigned int window_count = 0;
inline std::uintptr_t next_window_handle = 0x10000;

static inline bool IsValidKey(int virtual_key)
{
	return virtual_key >= 0 && virtual_key < 256;
}

static inline void SetCursorPosition(int x, int y)
{
	cursor_position.x = x;
	cursor_position.y = y;
	cursor_position_available = true;
}

static inline void SetKeyState(int virtual_key, bool is_down)
{
	if (!IsValidKey(virtual_key)) {
		return;
	}

	if (is_down && !key_down[virtual_key]) {
		key_pressed_since_last_query[virtual_key] = true;
	}
	key_down[virtual_key] = is_down;
}

static inline SHORT BuildKeyState(int virtual_key, bool consume_pressed_since_last_query)
{
	if (!IsValidKey(virtual_key)) {
		return 0;
	}

	SHORT state = key_down[virtual_key] ? static_cast<SHORT>(0x8000) : 0;
	if (key_pressed_since_last_query[virtual_key]) {
		state = static_cast<SHORT>(state | 0x0001);
		if (consume_pressed_since_last_query) {
			key_pressed_since_last_query[virtual_key] = false;
		}
	}
	return state;
}

static inline SHORT GetAsyncKeyState(int virtual_key)
{
	return BuildKeyState(virtual_key, true);
}

static inline SHORT PeekKeyState(int virtual_key)
{
	return BuildKeyState(virtual_key, false);
}

static inline unsigned int MessageQueueCapacity()
{
	return static_cast<unsigned int>(sizeof(message_queue) / sizeof(message_queue[0]));
}

static inline unsigned int KeyboardMessageQueueCapacity()
{
	return static_cast<unsigned int>(sizeof(keyboard_message_queue) / sizeof(keyboard_message_queue[0]));
}

static inline bool IsKeyboardMessage(UINT message)
{
	return message >= WM_KEYDOWN && message <= WM_SYSKEYUP;
}

static inline bool MessageMatchesFilter(const MSG &message, HWND window, UINT filter_min, UINT filter_max)
{
	if (window != nullptr && message.hwnd != window) {
		return false;
	}
	if (filter_min == 0 && filter_max == 0) {
		return true;
	}
	return message.message >= filter_min && message.message <= filter_max;
}

static inline void RemoveQueuedMessage(unsigned int logical_index)
{
	if (logical_index >= message_queue_count) {
		return;
	}

	for (unsigned int index = logical_index; index + 1 < message_queue_count; ++index) {
		message_queue[index] = message_queue[index + 1];
	}
	message_queue[message_queue_count - 1] = {};
	--message_queue_count;
}

static inline void RemoveQueuedKeyboardMessage(unsigned int logical_index)
{
	if (logical_index >= keyboard_message_queue_count) {
		return;
	}

	for (unsigned int index = logical_index; index + 1 < keyboard_message_queue_count; ++index) {
		keyboard_message_queue[index] = keyboard_message_queue[index + 1];
	}
	keyboard_message_queue[keyboard_message_queue_count - 1] = {};
	--keyboard_message_queue_count;
}

static inline bool ReadQueuedMessage(MSG *message, HWND window, UINT filter_min, UINT filter_max, bool remove)
{
	for (unsigned int index = 0; index < message_queue_count; ++index) {
		MSG &queued = message_queue[index];
		if (!MessageMatchesFilter(queued, window, filter_min, filter_max)) {
			continue;
		}

		if (message != nullptr) {
			*message = queued;
		}
		if (remove) {
			RemoveQueuedMessage(index);
		}
		return true;
	}
	return false;
}

static inline bool ReadQueuedKeyboardMessage(MSG *message, bool remove)
{
	for (unsigned int index = 0; index < keyboard_message_queue_count; ++index) {
		MSG &queued = keyboard_message_queue[index];
		if (!IsKeyboardMessage(queued.message)) {
			continue;
		}

		if (message != nullptr) {
			*message = queued;
		}
		if (remove) {
			RemoveQueuedKeyboardMessage(index);
		}
		return true;
	}
	return false;
}

static inline bool QueueKeyboardMessageCopy(const MSG &message)
{
	if (!IsKeyboardMessage(message.message)) {
		return true;
	}
	if (keyboard_message_queue_count >= KeyboardMessageQueueCapacity()) {
		keyboard_message_queue_overflowed = true;
		return false;
	}

	keyboard_message_queue[keyboard_message_queue_count] = message;
	++keyboard_message_queue_count;
	return true;
}

static inline bool QueueMessage(HWND window, UINT message, WPARAM w_param, LPARAM l_param, DWORD time, const POINT *point)
{
	if (message_queue_count >= MessageQueueCapacity()) {
		message_queue_overflowed = true;
		return false;
	}

	MSG &queued = message_queue[message_queue_count];
	queued.hwnd = window;
	queued.message = message;
	queued.wParam = w_param;
	queued.lParam = l_param;
	queued.time = time != 0 ? time : static_cast<DWORD>(Win32PortNowMilliseconds());
	queued.pt = point != nullptr ? *point : cursor_position;
	++message_queue_count;
	QueueKeyboardMessageCopy(queued);
	return true;
}

static inline unsigned int WindowClassCapacity()
{
	return static_cast<unsigned int>(sizeof(window_classes) / sizeof(window_classes[0]));
}

static inline unsigned int WindowCapacity()
{
	return static_cast<unsigned int>(sizeof(windows) / sizeof(windows[0]));
}

static inline bool WindowClassNamesEqual(LPCSTR left, LPCSTR right)
{
	if (left == nullptr || right == nullptr) {
		return left == right;
	}
	return std::strcmp(left, right) == 0;
}

static inline WindowClassRecord *FindWindowClass(LPCSTR class_name)
{
	for (unsigned int index = 0; index < window_class_count; ++index) {
		if (WindowClassNamesEqual(window_classes[index].name, class_name)) {
			return &window_classes[index];
		}
	}
	return nullptr;
}

static inline ATOM RegisterWindowClass(const WNDCLASSA *window_class)
{
	if (window_class == nullptr || window_class->lpszClassName == nullptr) {
		return 0;
	}

	if (WindowClassRecord *existing = FindWindowClass(window_class->lpszClassName)) {
		existing->procedure = window_class->lpfnWndProc;
		return static_cast<ATOM>((existing - window_classes) + 1);
	}
	if (window_class_count >= WindowClassCapacity()) {
		return 0;
	}

	WindowClassRecord &record = window_classes[window_class_count];
	record.name = window_class->lpszClassName;
	record.procedure = window_class->lpfnWndProc;
	++window_class_count;
	return static_cast<ATOM>(window_class_count);
}

static inline WindowRecord *FindWindow(HWND window)
{
	for (unsigned int index = 0; index < window_count; ++index) {
		if (windows[index].handle == window) {
			return &windows[index];
		}
	}
	return nullptr;
}

static inline HWND CreateWindowRecord(LPCSTR class_name, int x = 0, int y = 0, int width = 0, int height = 0)
{
	if (window_count >= WindowCapacity()) {
		return nullptr;
	}

	WindowRecord &record = windows[window_count];
	record.handle = reinterpret_cast<HWND>(next_window_handle++);
	record.class_name = class_name;
	record.rect.left = x;
	record.rect.top = y;
	record.rect.right = x + width;
	record.rect.bottom = y + height;
	if (WindowClassRecord *window_class = FindWindowClass(class_name)) {
		record.procedure = window_class->procedure;
	}
	++window_count;
	if (record.procedure != nullptr) {
		record.procedure(record.handle, WM_CREATE, 0, 0);
	}
	return record.handle;
}

static inline bool DestroyWindowRecord(HWND window)
{
	for (unsigned int index = 0; index < window_count; ++index) {
		if (windows[index].handle != window) {
			continue;
		}
		WNDPROC procedure = windows[index].procedure;
		if (procedure != nullptr) {
			procedure(window, WM_DESTROY, 0, 0);
		}
		for (unsigned int tail = index; tail + 1 < window_count; ++tail) {
			windows[tail] = windows[tail + 1];
		}
		windows[window_count - 1] = {};
		--window_count;
		return true;
	}
	return false;
}

static inline WNDPROC GetWindowProcedure(HWND window)
{
	if (WindowRecord *record = FindWindow(window)) {
		return record->procedure;
	}
	return nullptr;
}

static inline WNDPROC SetWindowProcedure(HWND window, WNDPROC procedure)
{
	if (WindowRecord *record = FindWindow(window)) {
		WNDPROC previous = record->procedure;
		record->procedure = procedure;
		return previous;
	}
	return nullptr;
}

static inline void Reset()
{
	cursor_position = {0, 0};
	cursor_position_available = false;
	current_cursor = nullptr;
	capture_window = nullptr;
	message_queue_count = 0;
	message_queue_overflowed = false;
	keyboard_message_queue_count = 0;
	keyboard_message_queue_overflowed = false;
	quit_message_posts = 0;
	last_quit_exit_code = 0;
	for (unsigned int index = 0; index < MessageQueueCapacity(); ++index) {
		message_queue[index] = {};
	}
	for (unsigned int index = 0; index < KeyboardMessageQueueCapacity(); ++index) {
		keyboard_message_queue[index] = {};
	}
	for (int index = 0; index < 256; ++index) {
		key_down[index] = false;
		key_pressed_since_last_query[index] = false;
	}
}
}

static inline HCURSOR LoadCursor(HINSTANCE, LPCSTR cursor_name)
{
	return reinterpret_cast<HCURSOR>(const_cast<char *>(cursor_name));
}

static inline HCURSOR LoadCursorFromFile(LPCSTR path)
{
	return reinterpret_cast<HCURSOR>(const_cast<char *>(path));
}

static inline HCURSOR SetCursor(HCURSOR cursor)
{
	HCURSOR previous = WasmWin32Input::current_cursor;
	WasmWin32Input::current_cursor = cursor;
	return previous;
}

static inline BOOL GetCursorPos(POINT *point)
{
	if (point == nullptr) {
		return FALSE;
	}

	*point = WasmWin32Input::cursor_position;
	return WasmWin32Input::cursor_position_available ? TRUE : FALSE;
}

static inline BOOL SetCursorPos(int x, int y)
{
	WasmWin32Input::SetCursorPosition(x, y);
	return TRUE;
}

static inline BOOL ScreenToClient(HWND, POINT *)
{
	return TRUE;
}

static inline BOOL ClientToScreen(HWND, POINT *)
{
	return TRUE;
}

static inline SHORT GetAsyncKeyState(int virtual_key)
{
	return WasmWin32Input::GetAsyncKeyState(virtual_key);
}

static inline SHORT GetKeyState(int virtual_key)
{
	return WasmWin32Input::PeekKeyState(virtual_key);
}

static inline BOOL GetKeyboardState(PBYTE key_state)
{
	if (key_state == nullptr) {
		return FALSE;
	}

	std::memset(key_state, 0, 256);
	for (int virtual_key = 0; virtual_key < 256; ++virtual_key) {
		if (WasmWin32Input::key_down[virtual_key]) {
			key_state[virtual_key] = static_cast<BYTE>(key_state[virtual_key] | 0x80);
		}
		if (WasmWin32Input::key_pressed_since_last_query[virtual_key]) {
			key_state[virtual_key] = static_cast<BYTE>(key_state[virtual_key] | 0x01);
		}
	}
	return TRUE;
}

static inline UINT MapVirtualKey(UINT code, UINT map_type)
{
	if (map_type == MAPVK_VK_TO_VSC) {
		return code & 0xffU;
	}
	return code & 0xffU;
}

static inline char Win32PortShiftedDigit(UINT virtual_key)
{
	static const char shifted_digits[] = ")!@#$%^&*(";
	if (virtual_key >= '0' && virtual_key <= '9') {
		return shifted_digits[virtual_key - '0'];
	}
	return '\0';
}

static inline char Win32PortAsciiForVirtualKey(UINT virtual_key, bool shift, bool caps_lock)
{
	if (virtual_key >= 'A' && virtual_key <= 'Z') {
		const bool uppercase = shift != caps_lock;
		return static_cast<char>((uppercase ? 'A' : 'a') + (virtual_key - 'A'));
	}
	if (virtual_key >= '0' && virtual_key <= '9') {
		return shift ? Win32PortShiftedDigit(virtual_key) : static_cast<char>('0' + (virtual_key - '0'));
	}
	if (virtual_key >= VK_NUMPAD0 && virtual_key <= VK_NUMPAD9) {
		return static_cast<char>('0' + (virtual_key - VK_NUMPAD0));
	}

	switch (virtual_key) {
		case VK_BACK: return '\b';
		case VK_TAB: return '\t';
		case VK_RETURN: return '\r';
		case VK_ESCAPE: return static_cast<char>(0x1b);
		case VK_SPACE: return ' ';
		case VK_MULTIPLY: return '*';
		case VK_ADD: return '+';
		case VK_SEPARATOR: return ',';
		case VK_SUBTRACT: return '-';
		case VK_DECIMAL: return '.';
		case VK_DIVIDE: return '/';
		case 0xBA: return shift ? ':' : ';';
		case 0xBB: return shift ? '+' : '=';
		case 0xBC: return shift ? '<' : ',';
		case 0xBD: return shift ? '_' : '-';
		case 0xBE: return shift ? '>' : '.';
		case 0xBF: return shift ? '?' : '/';
		case 0xC0: return shift ? '~' : '`';
		case 0xDB: return shift ? '{' : '[';
		case 0xDC: return shift ? '|' : '\\';
		case 0xDD: return shift ? '}' : ']';
		case 0xDE: return shift ? '"' : '\'';
		default: return '\0';
	}
}

static inline int ToAscii(UINT virtual_key, UINT, PBYTE key_state, LPWORD translated, UINT)
{
	if (translated == nullptr) {
		return 0;
	}

	const bool shift = key_state != nullptr && (key_state[VK_SHIFT] & 0x80) != 0;
	const bool caps_lock = key_state != nullptr && (key_state[VK_CAPITAL] & 0x01) != 0;
	const char ascii = Win32PortAsciiForVirtualKey(virtual_key & 0xffU, shift, caps_lock);
	if (ascii == '\0') {
		return 0;
	}

	translated[0] = static_cast<WORD>(static_cast<unsigned char>(ascii));
	return 1;
}

static inline HWND SetCapture(HWND window)
{
	HWND previous = WasmWin32Input::capture_window;
	WasmWin32Input::capture_window = window;
	return previous;
}

static inline BOOL ReleaseCapture()
{
	WasmWin32Input::capture_window = nullptr;
	return TRUE;
}

static inline HWND GetCapture()
{
	return WasmWin32Input::capture_window;
}

static inline BOOL GetWindowRect(HWND window, RECT *rect)
{
	if (rect == nullptr) {
		return FALSE;
	}

	if (const WasmWin32Input::WindowRecord *record = WasmWin32Input::FindWindow(window)) {
		*rect = record->rect;
		return TRUE;
	}

	*rect = {};
	return FALSE;
}

static inline BOOL GetClientRect(HWND window, RECT *rect)
{
	if (rect == nullptr) {
		return FALSE;
	}

	RECT window_rect = {};
	if (!GetWindowRect(window, &window_rect)) {
		*rect = {};
		return FALSE;
	}

	rect->left = 0;
	rect->top = 0;
	rect->right = window_rect.right - window_rect.left;
	rect->bottom = window_rect.bottom - window_rect.top;
	return TRUE;
}

static inline HWND GetDesktopWindow()
{
	return nullptr;
}

static inline ATOM RegisterClassA(const WNDCLASSA *window_class)
{
	return WasmWin32Input::RegisterWindowClass(window_class);
}

#ifndef RegisterClass
#define RegisterClass RegisterClassA
#endif

static inline HWND CreateWindowExA(
	DWORD,
	LPCSTR class_name,
	LPCSTR,
	DWORD,
	int x,
	int y,
	int width,
	int height,
	HWND,
	HMENU,
	HINSTANCE,
	LPVOID)
{
	return WasmWin32Input::CreateWindowRecord(class_name, x, y, width, height);
}

static inline HWND CreateWindowA(
	LPCSTR class_name,
	LPCSTR window_name,
	DWORD style,
	int x,
	int y,
	int width,
	int height,
	HWND parent,
	HMENU menu,
	HINSTANCE instance,
	LPVOID param)
{
	return CreateWindowExA(0, class_name, window_name, style, x, y, width, height, parent, menu, instance, param);
}

#ifndef CreateWindowEx
#define CreateWindowEx CreateWindowExA
#endif

#ifndef CreateWindow
#define CreateWindow CreateWindowA
#endif

static inline BOOL DestroyWindow(HWND window)
{
	return WasmWin32Input::DestroyWindowRecord(window) ? TRUE : FALSE;
}

static inline BOOL IsIconic(HWND)
{
	return FALSE;
}

static inline LONG GetWindowLong(HWND window, int index)
{
	if (index == GWL_WNDPROC || index == GWLP_WNDPROC) {
		return static_cast<LONG>(reinterpret_cast<std::intptr_t>(WasmWin32Input::GetWindowProcedure(window)));
	}
	return 0;
}

static inline LONG SetWindowLong(HWND window, int index, LONG value)
{
	if (index == GWL_WNDPROC || index == GWLP_WNDPROC) {
		WNDPROC previous = WasmWin32Input::SetWindowProcedure(
			window,
			reinterpret_cast<WNDPROC>(static_cast<std::intptr_t>(value)));
		return static_cast<LONG>(reinterpret_cast<std::intptr_t>(previous));
	}
	return 0;
}

static inline BOOL AdjustWindowRect(RECT *, DWORD, BOOL)
{
	return TRUE;
}

static inline char *lstrcpy(char *dest, const char *source)
{
	return std::strcpy(dest, source ? source : "");
}

static inline char *lstrcat(char *dest, const char *source)
{
	return std::strcat(dest, source ? source : "");
}

static inline int lstrlen(const char *text)
{
	return text ? static_cast<int>(std::strlen(text)) : 0;
}

static inline int lstrcmpi(const char *left, const char *right)
{
	if (left == nullptr && right == nullptr) {
		return 0;
	}
	if (left == nullptr) {
		return -1;
	}
	if (right == nullptr) {
		return 1;
	}
	return strcasecmp(left, right);
}

static inline char *lstrcpyn(char *dest, const char *source, int count)
{
	if (dest == nullptr || count <= 0) {
		return dest;
	}
	if (source == nullptr) {
		dest[0] = '\0';
		return dest;
	}
	std::strncpy(dest, source, static_cast<std::size_t>(count));
	dest[count - 1] = '\0';
	return dest;
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

static inline UINT GetDriveType(LPCSTR)
{
	return DRIVE_NO_ROOT_DIR;
}

static inline BOOL GetVolumeInformation(LPCSTR, LPSTR, DWORD, LPDWORD, LPDWORD, LPDWORD, LPSTR, DWORD)
{
	return FALSE;
}

BOOL ExtTextOutW(HDC dc, int x, int y, UINT options, const RECT *rect, LPCWSTR text, UINT count, const int *dx);
BOOL GetTextExtentPoint32W(HDC dc, LPCWSTR text, int count, SIZE *size);
BOOL GetTextMetrics(HDC dc, TEXTMETRIC *metrics);
HDC GetDC(HWND window);
int ReleaseDC(HWND window, HDC dc);
BOOL SetDeviceGammaRamp(HDC dc, LPVOID ramp);
HFONT CreateFont(
	int height,
	int width,
	int escapement,
	int orientation,
	int weight,
	DWORD italic,
	DWORD underline,
	DWORD strike_out,
	DWORD char_set,
	DWORD output_precision,
	DWORD clip_precision,
	DWORD quality,
	DWORD pitch_and_family,
	LPCSTR face_name);
HBITMAP CreateDIBSection(HDC dc, const BITMAPINFO *bitmap_info, UINT usage, void **bits, HANDLE section, DWORD offset);
HDC CreateCompatibleDC(HDC dc);
BOOL DeleteDC(HDC dc);
HGDIOBJ SelectObject(HDC dc, HGDIOBJ object);
BOOL DeleteObject(HGDIOBJ object);
COLORREF SetBkColor(HDC dc, COLORREF color);
COLORREF SetTextColor(HDC dc, COLORREF color);

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

static inline BOOL PeekMessage(MSG *message, HWND window, UINT filter_min, UINT filter_max, UINT remove_msg)
{
	return WasmWin32Input::ReadQueuedMessage(
		message,
		window,
		filter_min,
		filter_max,
		(remove_msg & PM_REMOVE) != 0) ? TRUE : FALSE;
}

static inline BOOL GetMessage(MSG *message, HWND window, UINT filter_min, UINT filter_max)
{
	if (!WasmWin32Input::ReadQueuedMessage(message, window, filter_min, filter_max, true)) {
		return FALSE;
	}
	return message != nullptr && message->message == WM_QUIT ? FALSE : TRUE;
}

static inline BOOL PostMessage(HWND window, UINT message, WPARAM w_param, LPARAM l_param)
{
	return WasmWin32Input::QueueMessage(window, message, w_param, l_param, 0, nullptr) ? TRUE : FALSE;
}

static inline void PostQuitMessage(int exit_code)
{
	if (WasmWin32Input::QueueMessage(nullptr, WM_QUIT, static_cast<WPARAM>(exit_code), 0, 0, nullptr)) {
		++WasmWin32Input::quit_message_posts;
		WasmWin32Input::last_quit_exit_code = exit_code;
	}
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

static inline LONG DispatchMessage(const MSG *message)
{
	if (message == nullptr) {
		return 0;
	}
	if (WNDPROC procedure = WasmWin32Input::GetWindowProcedure(message->hwnd)) {
		return static_cast<LONG>(procedure(message->hwnd, message->message, message->wParam, message->lParam));
	}
	return 0;
}

static inline LRESULT DefWindowProc(HWND, UINT, WPARAM, LPARAM)
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

#if defined(WASM_D3D8_LOADER_SHIM)
extern "C" HMODULE wasm_d3d8_load_library_a(LPCSTR library_name);
extern "C" BOOL wasm_d3d8_free_library(HMODULE module);
extern "C" FARPROC wasm_d3d8_get_proc_address(HMODULE module, LPCSTR procedure_name);
#endif

static inline HMODULE LoadLibraryA(LPCSTR library_name)
{
#if defined(WASM_D3D8_LOADER_SHIM)
	return wasm_d3d8_load_library_a(library_name);
#else
	(void)library_name;
	return nullptr;
#endif
}

static inline BOOL FreeLibrary(HMODULE module)
{
#if defined(WASM_D3D8_LOADER_SHIM)
	return wasm_d3d8_free_library(module);
#else
	(void)module;
	return TRUE;
#endif
}

static inline FARPROC GetProcAddress(HMODULE module, LPCSTR procedure_name)
{
#if defined(WASM_D3D8_LOADER_SHIM)
	return wasm_d3d8_get_proc_address(module, procedure_name);
#else
	(void)module;
	(void)procedure_name;
	return nullptr;
#endif
}

#ifndef LoadLibrary
#define LoadLibrary LoadLibraryA
#endif

static inline DWORD GetTickCount()
{
	return static_cast<DWORD>(Win32PortNowMilliseconds());
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
		counter->QuadPart = static_cast<long long>((Win32PortNowMilliseconds() * 1000.0) + 0.5);
	}
	return TRUE;
}

static inline BOOL QueryPerformanceFrequency(LARGE_INTEGER *frequency)
{
	if (frequency != nullptr) {
		frequency->QuadPart = 1000000;
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

static inline DWORD GetTempPath(DWORD buffer_len, LPSTR buffer)
{
	if (buffer == nullptr || buffer_len == 0) {
		return 0;
	}

	const char *temp = std::getenv("TMPDIR");
	if (temp == nullptr || temp[0] == '\0') {
		temp = "/tmp";
	}

	const std::size_t temp_len = std::strlen(temp);
	const bool needs_slash = temp_len == 0 || temp[temp_len - 1] != '/';
	const std::size_t required = temp_len + (needs_slash ? 1 : 0);
	if (required + 1 > static_cast<std::size_t>(buffer_len)) {
		return static_cast<DWORD>(required + 1);
	}

	std::snprintf(
		buffer,
		static_cast<std::size_t>(buffer_len),
		needs_slash ? "%s/" : "%s",
		temp);
	return static_cast<DWORD>(required);
}

static inline UINT GetWindowsDirectory(LPSTR buffer, UINT buffer_len)
{
	return static_cast<UINT>(GetTempPath(buffer_len, buffer));
}

static inline UINT GetTempFileName(LPCSTR path, LPCSTR prefix, UINT unique, LPSTR buffer)
{
	if (buffer == nullptr) {
		return 0;
	}

	char temp_path[_MAX_PATH];
	if (path == nullptr || path[0] == '\0') {
		if (GetTempPath(sizeof(temp_path), temp_path) == 0) {
			return 0;
		}
		path = temp_path;
	}

	const char *name_prefix = prefix != nullptr ? prefix : "tmp";
	const UINT suffix = unique != 0 ? unique : static_cast<UINT>(getpid());
	const std::size_t path_len = std::strlen(path);
	const bool has_separator = path_len > 0 && (path[path_len - 1] == '/' || path[path_len - 1] == '\\');
	const int written = std::snprintf(
		buffer,
		_MAX_PATH,
		has_separator ? "%s%s%u.tmp" : "%s/%s%u.tmp",
		path,
		name_prefix,
		suffix);
	return written > 0 && written < _MAX_PATH ? suffix : 0;
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

static inline HANDLE CreateFile(
	LPCSTR filename,
	DWORD,
	DWORD,
	void *,
	DWORD,
	DWORD,
	HANDLE)
{
	if (filename == nullptr) {
		return INVALID_HANDLE_VALUE;
	}

	const std::string normalized = WasmNormalizePath(filename);
	FILE *file = std::fopen(normalized.c_str(), "wb");
	return file != nullptr ? reinterpret_cast<HANDLE>(file) : INVALID_HANDLE_VALUE;
}

static inline BOOL WriteFile(HANDLE file, LPCVOID buffer, DWORD bytes_to_write, LPDWORD bytes_written, void *)
{
	if (bytes_written != nullptr) {
		*bytes_written = 0;
	}
	if (file == nullptr || file == INVALID_HANDLE_VALUE || buffer == nullptr) {
		return FALSE;
	}

	FILE *stream = reinterpret_cast<FILE *>(file);
	const std::size_t written = std::fwrite(buffer, 1, static_cast<std::size_t>(bytes_to_write), stream);
	std::fflush(stream);
	if (bytes_written != nullptr) {
		*bytes_written = static_cast<DWORD>(written);
	}
	return written == static_cast<std::size_t>(bytes_to_write) ? TRUE : FALSE;
}

static inline int LoadString(HINSTANCE, UINT, LPSTR, int)
{
	return 0;
}

static inline HINSTANCE FindExecutable(LPCSTR, LPCSTR, LPSTR result)
{
	if (result != nullptr) {
		result[0] = '\0';
	}
	return nullptr;
}

static inline BOOL CreateProcess(
	LPCSTR,
	LPSTR,
	void *,
	void *,
	BOOL,
	DWORD,
	void *,
	LPCSTR,
	STARTUPINFO *,
	PROCESS_INFORMATION *process_info)
{
	if (process_info != nullptr) {
		process_info->hProcess = nullptr;
		process_info->hThread = nullptr;
		process_info->dwProcessId = 0;
		process_info->dwThreadId = 0;
	}
	return FALSE;
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

static inline HANDLE CreateEvent(void *, BOOL, BOOL, const char *)
{
	return reinterpret_cast<HANDLE>(static_cast<std::uintptr_t>(1));
}

static inline HANDLE CreateMutex(void *, BOOL, const char *)
{
	return reinterpret_cast<HANDLE>(static_cast<std::uintptr_t>(1));
}

static inline BOOL ReleaseMutex(HANDLE)
{
	return TRUE;
}

static inline BOOL CloseHandle(HANDLE)
{
	return TRUE;
}

static inline int MulDiv(int number, int numerator, int denominator)
{
	if (denominator == 0) {
		return -1;
	}
	return static_cast<int>((static_cast<long long>(number) * numerator) / denominator);
}

static inline HANDLE CreateThread(
	void *,
	DWORD,
	LPTHREAD_START_ROUTINE start_address,
	LPVOID parameter,
	DWORD,
	LPDWORD thread_id)
{
	if (thread_id != nullptr) {
		*thread_id = 1;
	}
	if (start_address != nullptr) {
		start_address(parameter);
	}
	return reinterpret_cast<HANDLE>(static_cast<std::uintptr_t>(1));
}

static inline BOOL TerminateThread(HANDLE, DWORD)
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
