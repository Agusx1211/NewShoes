// Browser no-op stubs for the subset of Win32 GDI functions declared in the
// project windows.h shim that are referenced (transitively, through the WW3D
// asset-manager -> font/GDI-surface code path) when a WW3D probe links the
// original WW3DAssetManager / FontCharsClass / Render2DSentenceClass surface.
//
// The browser port cannot use real GDI; these stubs satisfy the linker so the
// genuine original mesh/asset APIs can be exercised. They are no-ops that are
// not reached by the renderer probes (which do not render GDI fonts); a real
// browser font/surface bridge is tracked as a follow-up in TODO.md.

#include "windows.h"

BOOL GetTextMetrics(HDC /*dc*/, TEXTMETRIC *metrics)
{
	if (metrics != nullptr) {
		// Plausible zero'd metrics so any (currently unused) caller does not
		// dereference garbage if it ever runs in a browser build.
		ZeroMemory(metrics, sizeof(TEXTMETRIC));
	}
	return FALSE;
}

HDC GetDC(HWND /*window*/)
{
	return nullptr;
}

int ReleaseDC(HWND /*window*/, HDC /*dc*/)
{
	return 0;
}

HFONT CreateFont(
	int /*height*/,
	int /*width*/,
	int /*escapement*/,
	int /*orientation*/,
	int /*weight*/,
	DWORD /*italic*/,
	DWORD /*underline*/,
	DWORD /*strike_out*/,
	DWORD /*char_set*/,
	DWORD /*output_precision*/,
	DWORD /*clip_precision*/,
	DWORD /*quality*/,
	DWORD /*pitch_and_family*/,
	LPCSTR /*face_name*/)
{
	return nullptr;
}

HBITMAP CreateDIBSection(
	HDC /*dc*/,
	const BITMAPINFO * /*bitmap_info*/,
	UINT /*usage*/,
	void **bits,
	HANDLE /*section*/,
	DWORD /*offset*/)
{
	if (bits != nullptr) {
		*bits = nullptr;
	}
	return nullptr;
}

HDC CreateCompatibleDC(HDC /*dc*/)
{
	return nullptr;
}

BOOL DeleteDC(HDC /*dc*/)
{
	return FALSE;
}

HGDIOBJ SelectObject(HDC /*dc*/, HGDIOBJ /*object*/)
{
	return nullptr;
}

BOOL DeleteObject(HGDIOBJ /*object*/)
{
	return FALSE;
}

COLORREF SetBkColor(HDC /*dc*/, COLORREF /*color*/)
{
	return 0;
}

COLORREF SetTextColor(HDC /*dc*/, COLORREF /*color*/)
{
	return 0;
}
