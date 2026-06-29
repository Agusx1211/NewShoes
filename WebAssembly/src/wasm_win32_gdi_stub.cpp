// Browser no-op stubs for Win32 GDI entry points that are transitively
// referenced by the original WW3D asset-manager/font surface. Renderer probes
// do not reach these paths; real browser font/surface rendering is tracked in
// TODO.md before DisplayString/GDI text can be considered ported.

#include "windows.h"

BOOL GetTextMetrics(HDC /*dc*/, TEXTMETRIC *metrics)
{
	if (metrics != nullptr) {
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

BOOL GetTextExtentPoint32W(HDC /*dc*/, LPCWSTR /*text*/, int /*count*/, SIZE *size)
{
	if (size != nullptr) {
		size->cx = 0;
		size->cy = 0;
	}
	return FALSE;
}

BOOL ExtTextOutW(HDC /*dc*/, int /*x*/, int /*y*/, UINT /*options*/, const RECT * /*rect*/,
	LPCWSTR /*text*/, UINT /*count*/, const int * /*dx*/)
{
	return FALSE;
}
