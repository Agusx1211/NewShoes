// Browser-canvas-backed Win32 GDI font/surface bridge for the original WW3D
// FontCharsClass / Render2DSentenceClass text path.
//
// The original FontCharsClass (WW3D2/render2dsentence.cpp) rasterizes each
// glyph through the Win32 GDI retained-mode API: CreateFont, CreateCompatibleDC,
// CreateDIBSection, SelectObject, SetBkColor/SetTextColor, ExtTextOutW,
// GetTextExtentPoint32W, GetTextMetrics, DeleteObject, DeleteDC.  The original
// game logic that drives those calls is reused verbatim; this file only ports
// the platform/device dependency (GDI) onto a browser Canvas 2D rasterizer.
//
// This translation unit provides the single definition of those GDI entry
// points for the browser `cnc-port` executable.  Node smoke targets keep the
// no-op `wasm_win32_gdi_stub.cpp` implementation.  The rasterizer is reached
// through a synchronous Emscripten EM_ASM hook installed by harness/bridge.js
// (`Module.cncGdiRasterizeGlyph` / `Module.cncGdiMeasure`).  When the hook is
// absent (node, or a harness that has not installed it) the functions degrade
// to the same no-op behavior the stub has today, so this bridge is safe to link
// in any single-threaded wasm context.
//
// See TODO.md (M4 — "Replace the probe's no-op browser stubs for the Win32 GDI
// functions ...").

#include "windows.h"

#include <cstdio>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <new>
#include <string>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

namespace {

// Handle type tag, stashed as the first field of every GDI object so that
// SelectObject / DeleteObject can distinguish fonts, bitmaps, and DCs even
// though Win32 types them all as opaque void* handles.
enum class GdiKind : std::uint32_t {
	Font = 0x464F4E54u, // 'FONT'
	Bitmap = 0x424D5054u, // 'BMPT'
	DeviceContext = 0x44435854u, // 'DCXT'
};

struct GdiHeader {
	GdiKind kind;
};

struct GdiFont {
	GdiHeader header{GdiKind::Font};
	std::string faceName;
	int logicalHeight = 0; // pixel height as resolved by CreateFont (negative => top-down mapping)
	int width = 0;
	int weight = FW_NORMAL;
	DWORD italic = FALSE;
	// Metrics cache, filled lazily through the canvas measure hook.
	bool metricsCached = false;
	LONG tmHeight = 0;
	LONG tmAscent = 0;
	LONG tmDescent = 0;
	LONG tmOverhang = 0;
	LONG tmAveCharWidth = 0;
};

struct GdiBitmap {
	GdiHeader header{GdiKind::Bitmap};
	int width = 0;   // biWidth, absolute (negative => top-down source, normalized here)
	int height = 0;  // abs(biHeight)
	int bitCount = 0;
	int stride = 0;  // bytes per row, already DWORD-padded (GDI contract)
	std::vector<std::uint8_t> pixels; // stride * height bytes
	bool topDown = true;
};

struct GdiDC {
	GdiHeader header{GdiKind::DeviceContext};
	bool isScreen = false;
	GdiFont *font = nullptr;
	GdiBitmap *bitmap = nullptr;
	COLORREF bkColor = RGB(0, 0, 0);
	COLORREF textColor = RGB(0, 0, 0);
};

inline bool kind_is(GdiHeader *h, GdiKind k) { return h != nullptr && h->kind == k; }

// ---- Synchronous JS canvas bridge hooks -------------------------------------
// These EM_ASM blocks call JS functions installed by harness/bridge.js.  When
// the hook is missing they return 0 and the caller degrades to no-op behavior,
// matching the historical stub contract.

#ifdef __EMSCRIPTEN__
#define CNC_HAS_GDI_HOOK() (cnc_gdi_hook_installed())

inline bool cnc_gdi_hook_installed()
{
	return EM_ASM_INT({
		return (typeof Module === "object" && Module !== null &&
			typeof Module.cncGdiRasterizeGlyph === "function" &&
			typeof Module.cncGdiMeasure === "function") ? 1 : 0;
	}) != 0;
}

// Measure a UTF-16 code unit sequence.  Writes width/height/ascent/overhang into
// the ints pointed to by the out parameters (any may be null).  Returns 1 if the
// JS hook produced metrics, 0 otherwise.  The JS hook is synchronous (canvas
// measureText is synchronous on the main thread).
inline int cnc_gdi_measure_js(const GdiFont &font, const WCHAR *text, int count,
                              LONG *out_width, LONG *out_height,
                              LONG *out_ascent, LONG *out_overhang)
{
	return EM_ASM_INT({
		const hook = Module.cncGdiMeasure;
		if (typeof hook !== "function") return 0;
		const face = UTF8ToString($0);
		const textPtr = $4 >>> 0;
		const textLen = $5 | 0;
		let str = "";
		if (textLen > 0) {
			if (textPtr === 0) return 0;
			const utf16 = new Uint16Array(HEAPU8.buffer, textPtr, textLen);
			for (let i = 0; i < textLen; i++) str += String.fromCharCode(utf16[i]);
		}
		const r = hook(face, $1, $2, $3, str);
		if (!r) return 0;
		if ($6 >>> 0) HEAP32[$6 >> 2] = (r.width | 0);
		if ($7 >>> 0) HEAP32[$7 >> 2] = (r.height | 0);
		if ($8 >>> 0) HEAP32[$8 >> 2] = (r.ascent | 0);
		if ($9 >>> 0) HEAP32[$9 >> 2] = (r.overhang | 0);
		return 1;
	}, font.faceName.c_str(), font.logicalHeight, font.weight, font.italic,
	   reinterpret_cast<std::uintptr_t>(text), count,
	   reinterpret_cast<std::uintptr_t>(out_width), reinterpret_cast<std::uintptr_t>(out_height),
	   reinterpret_cast<std::uintptr_t>(out_ascent), reinterpret_cast<std::uintptr_t>(out_overhang));
}

// Rasterize one UTF-16 code unit into the DC's selected bitmap at (x,y) honoring
// ETO_OPAQUE.  The JS hook writes BGR pixels into the bitmap's pixel buffer
// (DIB_RGB_COLORS, 24bpp, DWORD-padded stride, top-down).  Returns 1 if the JS
// hook rasterized, 0 otherwise.
inline int cnc_gdi_rasterize_js(const GdiFont &font, WCHAR ch, int x, int y,
                                std::uint8_t *bits, int bmpW, int bmpH, int stride,
                                COLORREF textColor, COLORREF bkColor,
                                bool opaque)
{
	return EM_ASM_INT({
		const hook = Module.cncGdiRasterizeGlyph;
		if (typeof hook !== "function") return 0;
		const face = UTF8ToString($0);
		return hook(face, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13 ? 1 : 0, HEAPU8) ? 1 : 0;
	}, font.faceName.c_str(), font.logicalHeight, font.weight, font.italic,
	   static_cast<int>(ch), x, y,
	   reinterpret_cast<std::uintptr_t>(bits), bmpW, bmpH, stride,
	   static_cast<int>(textColor & 0xFFFFFFu), static_cast<int>(bkColor & 0xFFFFFFu),
	   opaque ? 1 : 0);
}
#else
// Non-emscripten compile (should not be linked for the browser target).
inline bool cnc_gdi_hook_installed() { return false; }
#define CNC_HAS_GDI_HOOK() (false)
inline int cnc_gdi_measure_js(const GdiFont &, const WCHAR *, int, LONG *, LONG *, LONG *, LONG *) { return 0; }
inline int cnc_gdi_rasterize_js(const GdiFont &, WCHAR, int, int, std::uint8_t *, int, int, int, COLORREF, COLORREF, bool) { return 0; }
#endif

void ensure_font_metrics(GdiFont &font)
{
	if (font.metricsCached) {
		return;
	}
	font.metricsCached = true;
	if (!CNC_HAS_GDI_HOOK()) {
		// Conservative fallback so FontCharsClass still gets non-zero bookkeeping
		// when no rasterizer is installed (node smoke path).  These values mirror
		// the rough Arial metrics used historically; the original game logic
		// remains in charge of how they're consumed.
		const int px = font.logicalHeight != 0 ? (font.logicalHeight < 0 ? -font.logicalHeight : font.logicalHeight) : 16;
		font.tmHeight = px;
		font.tmAscent = px - (px / 4);
		font.tmDescent = px / 4;
		font.tmOverhang = 0;
		font.tmAveCharWidth = (px * 5) / 8;
		return;
	}
	const WCHAR probe[2] = {L'M', 0};
	LONG width = 0, height = 0, ascent = 0, overhang = 0;
	cnc_gdi_measure_js(font, probe, 1, &width, &height, &ascent, &overhang);
	font.tmHeight = height > 0 ? height : font.logicalHeight;
	font.tmAscent = ascent > 0 ? ascent : (font.tmHeight - (font.tmHeight / 4));
	font.tmDescent = font.tmHeight - font.tmAscent;
	font.tmOverhang = overhang;
	font.tmAveCharWidth = width > 0 ? width : ((font.tmHeight * 5) / 8);
}

} // namespace

// ---- Public GDI entry points ------------------------------------------------

HFONT CreateFont(int height, int width, int escapement, int orientation,
                 int weight, DWORD italic, DWORD underline, DWORD strike_out,
                 DWORD char_set, DWORD output_precision, DWORD clip_precision,
                 DWORD quality, DWORD pitch_and_family, LPCSTR face_name)
{
	(void)escapement;
	(void)orientation;
	(void)underline;
	(void)strike_out;
	(void)char_set;
	(void)output_precision;
	(void)clip_precision;
	(void)quality;
	(void)pitch_and_family;

	GdiFont *font = new (std::nothrow) GdiFont;
	if (font == nullptr) {
		return nullptr;
	}
	font->logicalHeight = height;
	font->width = width;
	font->weight = (weight == 0) ? FW_NORMAL : weight;
	font->italic = (italic != FALSE);
	if (face_name != nullptr) {
		font->faceName.assign(face_name);
	}
	return reinterpret_cast<HFONT>(font);
}

HDC CreateCompatibleDC(HDC dc)
{
	(void)dc;
	GdiDC *mem = new (std::nothrow) GdiDC;
	if (mem == nullptr) {
		return nullptr;
	}
	return reinterpret_cast<HDC>(mem);
}

HDC GetDC(HWND window)
{
	(void)window;
	// A non-null sentinel screen DC.  FontCharsClass only uses it to derive a
	// memory DC and a DIB section, never to read screen pixels.
	GdiDC *screen = new (std::nothrow) GdiDC;
	if (screen == nullptr) {
		return nullptr;
	}
	screen->isScreen = true;
	return reinterpret_cast<HDC>(screen);
}

int ReleaseDC(HWND window, HDC dc)
{
	(void)window;
	if (dc != nullptr) {
		GdiHeader *h = reinterpret_cast<GdiHeader *>(dc);
		if (kind_is(h, GdiKind::DeviceContext)) {
			delete reinterpret_cast<GdiDC *>(dc);
		}
	}
	return 1;
}

HBITMAP CreateDIBSection(HDC dc, const BITMAPINFO *bitmap_info, UINT usage,
                         void **bits, HANDLE section, DWORD offset)
{
	(void)dc;
	(void)section;
	(void)offset;
	if (bits != nullptr) {
		*bits = nullptr;
	}
	if (bitmap_info == nullptr || usage != DIB_RGB_COLORS) {
		return nullptr;
	}
	const BITMAPINFOHEADER &bh = bitmap_info->bmiHeader;
	if (bh.biBitCount != 24 || bh.biCompression != BI_RGB) {
		// FontCharsClass only ever requests 24bpp BI_RGB; refuse anything else
		// rather than guessing a layout the caller can't read back.
		return nullptr;
	}
	GdiBitmap *bmp = new (std::nothrow) GdiBitmap;
	if (bmp == nullptr) {
		return nullptr;
	}
	bmp->width = bh.biWidth;
	bmp->height = (bh.biHeight < 0) ? -bh.biHeight : bh.biHeight;
	bmp->topDown = (bh.biHeight < 0);
	bmp->bitCount = bh.biBitCount;
	// GDI DWORD-padded stride, matching FontCharsClass::Store_GDI_Char.
	const int raw_stride = ((bmp->width * 3) + 3) & ~3;
	bmp->stride = raw_stride;
	bmp->pixels.assign(static_cast<std::size_t>(raw_stride) * bmp->height, 0);
	if (bits != nullptr) {
		*bits = bmp->pixels.data();
	}
	return reinterpret_cast<HBITMAP>(bmp);
}

HGDIOBJ SelectObject(HDC dc, HGDIOBJ object)
{
	if (dc == nullptr) {
		return nullptr;
	}
	GdiDC *mem = reinterpret_cast<GdiDC *>(dc);
	if (!kind_is(&mem->header, GdiKind::DeviceContext)) {
		return nullptr;
	}
	GdiHeader *obj = reinterpret_cast<GdiHeader *>(object);
	if (object != nullptr && !kind_is(obj, GdiKind::Font) && !kind_is(obj, GdiKind::Bitmap)) {
		return nullptr;
	}

	if (object == nullptr || obj->kind == GdiKind::Font) {
		GdiFont *prev = mem->font;
		mem->font = reinterpret_cast<GdiFont *>(object);
		return reinterpret_cast<HGDIOBJ>(prev);
	}
	GdiBitmap *prev = mem->bitmap;
	mem->bitmap = reinterpret_cast<GdiBitmap *>(object);
	return reinterpret_cast<HGDIOBJ>(prev);
}

COLORREF SetBkColor(HDC dc, COLORREF color)
{
	if (dc == nullptr) {
		return 0;
	}
	GdiDC *mem = reinterpret_cast<GdiDC *>(dc);
	if (!kind_is(&mem->header, GdiKind::DeviceContext)) {
		return 0;
	}
	COLORREF prev = mem->bkColor;
	mem->bkColor = color & 0xFFFFFFu;
	return prev;
}

COLORREF SetTextColor(HDC dc, COLORREF color)
{
	if (dc == nullptr) {
		return 0;
	}
	GdiDC *mem = reinterpret_cast<GdiDC *>(dc);
	if (!kind_is(&mem->header, GdiKind::DeviceContext)) {
		return 0;
	}
	COLORREF prev = mem->textColor;
	mem->textColor = color & 0xFFFFFFu;
	return prev;
}

BOOL DeleteObject(HGDIOBJ object)
{
	if (object == nullptr) {
		return FALSE;
	}
	GdiHeader *h = reinterpret_cast<GdiHeader *>(object);
	if (h->kind == GdiKind::Font) {
		delete reinterpret_cast<GdiFont *>(object);
		return TRUE;
	}
	if (h->kind == GdiKind::Bitmap) {
		delete reinterpret_cast<GdiBitmap *>(object);
		return TRUE;
	}
	return FALSE;
}

BOOL DeleteDC(HDC dc)
{
	if (dc == nullptr) {
		return FALSE;
	}
	GdiHeader *h = reinterpret_cast<GdiHeader *>(dc);
	if (h->kind != GdiKind::DeviceContext) {
		return FALSE;
	}
	// Mirrors GDI: deleting a DC does not delete its selected font/bitmap.
	delete reinterpret_cast<GdiDC *>(dc);
	return TRUE;
}

BOOL GetTextMetrics(HDC dc, TEXTMETRIC *metrics)
{
	if (metrics == nullptr) {
		return FALSE;
	}
	::ZeroMemory(metrics, sizeof(TEXTMETRIC));
	if (dc == nullptr) {
		return FALSE;
	}
	GdiDC *mem = reinterpret_cast<GdiDC *>(dc);
	if (!kind_is(&mem->header, GdiKind::DeviceContext) || mem->font == nullptr) {
		return FALSE;
	}
	ensure_font_metrics(*mem->font);
	const GdiFont &f = *mem->font;
	metrics->tmHeight = f.tmHeight;
	metrics->tmAscent = f.tmAscent;
	metrics->tmDescent = f.tmDescent;
	metrics->tmInternalLeading = 0;
	metrics->tmExternalLeading = 0;
	metrics->tmAveCharWidth = f.tmAveCharWidth;
	metrics->tmMaxCharWidth = f.tmAveCharWidth;
	metrics->tmWeight = f.weight;
	metrics->tmOverhang = f.tmOverhang;
	metrics->tmItalic = (f.italic != FALSE) ? 1 : 0;
	metrics->tmPitchAndFamily = VARIABLE_PITCH;
	metrics->tmCharSet = DEFAULT_CHARSET;
	return TRUE;
}

BOOL GetTextExtentPoint32W(HDC dc, LPCWSTR text, int count, SIZE *size)
{
	if (size != nullptr) {
		size->cx = 0;
		size->cy = 0;
	}
	if (dc == nullptr || text == nullptr || count <= 0 || size == nullptr) {
		return FALSE;
	}
	GdiDC *mem = reinterpret_cast<GdiDC *>(dc);
	if (!kind_is(&mem->header, GdiKind::DeviceContext) || mem->font == nullptr) {
		return FALSE;
	}
	ensure_font_metrics(*mem->font);
	if (CNC_HAS_GDI_HOOK()) {
		LONG width = 0, height = 0;
		if (cnc_gdi_measure_js(*mem->font, text, count, &width, &height, nullptr, nullptr)) {
			size->cx = width;
			size->cy = (height > 0) ? height : mem->font->tmHeight;
			return TRUE;
		}
	}
	// Conservative fallback (node smoke path): advance width from cached average.
	size->cx = mem->font->tmAveCharWidth * count;
	size->cy = mem->font->tmHeight;
	return TRUE;
}

BOOL ExtTextOutW(HDC dc, int x, int y, UINT options, const RECT *rect,
                 LPCWSTR text, UINT count, const int *dx)
{
	(void)dx;
	if (dc == nullptr || text == nullptr) {
		return FALSE;
	}
	GdiDC *mem = reinterpret_cast<GdiDC *>(dc);
	if (!kind_is(&mem->header, GdiKind::DeviceContext)) {
		return FALSE;
	}
	if (mem->font == nullptr || mem->bitmap == nullptr) {
		return FALSE;
	}
	GdiBitmap &bmp = *mem->bitmap;
	const bool opaque = ((options & ETO_OPAQUE) != 0) && rect != nullptr;

	// ETO_OPAQUE fills the rectangle with the current background color first,
	// matching GDI semantics.  FontCharsClass relies on this to clear the cell
	// before drawing white text.
	if (opaque) {
		const int left = rect->left < 0 ? 0 : rect->left;
		const int top = rect->top < 0 ? 0 : rect->top;
		const int right = rect->right > bmp.width ? bmp.width : rect->right;
		const int bottom = rect->bottom > bmp.height ? bmp.height : rect->bottom;
		const std::uint8_t b = static_cast<std::uint8_t>((mem->bkColor >> 16) & 0xFF);
		const std::uint8_t g = static_cast<std::uint8_t>((mem->bkColor >> 8) & 0xFF);
		const std::uint8_t r = static_cast<std::uint8_t>(mem->bkColor & 0xFF);
		for (int row = top; row < bottom; ++row) {
			std::uint8_t *p = bmp.pixels.data() + (static_cast<std::size_t>(row) * bmp.stride) + (static_cast<std::size_t>(left) * 3);
			for (int col = left; col < right; ++col) {
				*p++ = b;
				*p++ = g;
				*p++ = r;
			}
		}
	}

	if (!CNC_HAS_GDI_HOOK()) {
		// No rasterizer available (node smoke path): the cell is already cleared
		// by ETO_OPAQUE, which is enough for FontCharsClass's no-asset smoke to
		// run without trapping on null pixel data.
		return TRUE;
	}

	BOOL ok = TRUE;
	for (UINT i = 0; i < count; ++i) {
		if (!cnc_gdi_rasterize_js(*mem->font, text[i], x, y, bmp.pixels.data(),
		                          bmp.width, bmp.height, bmp.stride,
		                          mem->textColor, mem->bkColor, opaque)) {
			ok = FALSE;
		}
	}
	return ok;
}

// ---- Focused browser probe --------------------------------------------------
// Mirrors the exact GDI call sequence FontCharsClass::Create_GDI_Font +
// Store_GDI_Char use, so the harness can prove real glyphs rasterize through
// the bridge without dragging in the full WW3D asset manager.  Filled into a
// caller-owned buffer; returns a JSON view owned by this translation unit.

namespace {

struct GdiFontProbeResult {
	bool ok = false;
	bool rasterizerInstalled = false;
	bool fontCreated = false;
	bool bitmapAllocated = false;
	bool metricsReported = false;
	bool measureReported = false;
	bool rasterized = false;
	int fontHeight = 0;
	int fontAscent = 0;
	int fontOverhang = 0;
	int measureCx = 0;
	int measureCy = 0;
	int bitmapWidth = 0;
	int bitmapHeight = 0;
	int bitmapStride = 0;
	std::size_t bitmapBytes = 0;
	std::size_t glyphCoverage = 0; // non-zero bytes touched by rasterization
	std::size_t totalPixels = 0;
	int sampleBlue = 0;
	int sampleGreen = 0;
	int sampleRed = 0;
	std::string chars;
	std::string json;
};

GdiFontProbeResult g_probe;

std::size_t count_nonzero_coverage(const std::vector<std::uint8_t> &pixels, int stride, int charHeight, int charWidth)
{
	std::size_t covered = 0;
	for (int row = 0; row < charHeight; ++row) {
		const std::uint8_t *p = pixels.data() + (static_cast<std::size_t>(row) * stride);
		for (int col = 0; col < charWidth; ++col) {
			// First byte of each BGR triple (FontCharsClass reads blue as intensity).
			if (p[static_cast<std::size_t>(col) * 3] != 0) {
				++covered;
			}
		}
	}
	return covered;
}

} // namespace

extern "C" const char *cnc_port_probe_gdi_font(int point_size, const char *face_name)
{
	g_probe = GdiFontProbeResult{};
	g_probe.rasterizerInstalled = CNC_HAS_GDI_HOOK();
	g_probe.chars = "AMgW ";

	HDC screen_dc = ::GetDC(nullptr);
	if (screen_dc == nullptr) {
		g_probe.ok = false;
	}
	HDC mem_dc = nullptr;
	HFONT font = nullptr;
	HBITMAP bitmap = nullptr;
	HBITMAP old_bitmap = nullptr;
	HFONT old_font = nullptr;
	void *bits = nullptr;
	bool cleaned = false;
	auto cleanup = [&]() {
		if (cleaned) return;
		cleaned = true;
		if (mem_dc != nullptr) {
			if (old_font != nullptr) ::SelectObject(mem_dc, reinterpret_cast<HGDIOBJ>(old_font));
			if (old_bitmap != nullptr) ::SelectObject(mem_dc, reinterpret_cast<HGDIOBJ>(old_bitmap));
			::DeleteDC(mem_dc);
		}
		if (font != nullptr) ::DeleteObject(reinterpret_cast<HGDIOBJ>(font));
		if (bitmap != nullptr) ::DeleteObject(reinterpret_cast<HGDIOBJ>(bitmap));
		if (screen_dc != nullptr) ::ReleaseDC(nullptr, screen_dc);
	};

	if (screen_dc == nullptr) {
		cleanup();
		g_probe.json = "{\"ok\":false,\"error\":\"getdc_failed\"}";
		return g_probe.json.c_str();
	}

	mem_dc = ::CreateCompatibleDC(screen_dc);
	if (mem_dc == nullptr) {
		cleanup();
		g_probe.json = "{\"ok\":false,\"error\":\"createdc_failed\"}";
		return g_probe.json.c_str();
	}

	// Match FontCharsClass::Create_GDI_Font's 96dpi height mapping so the
	// resulting pixel font size matches what the original engine requests.
	const int dots_per_inch = 96;
	const int font_height = -MulDiv(point_size, dots_per_inch, 72);
	font = ::CreateFont(font_height, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
	                    DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
	                    ANTIALIASED_QUALITY, VARIABLE_PITCH, face_name);
	if (font == nullptr) {
		cleanup();
		g_probe.json = "{\"ok\":false,\"error\":\"createfont_failed\"}";
		return g_probe.json.c_str();
	}
	g_probe.fontCreated = true;

	BITMAPINFOHEADER bh = {};
	bh.biSize = sizeof(BITMAPINFOHEADER);
	bh.biWidth = point_size * 2;
	bh.biHeight = -(point_size * 2);
	bh.biPlanes = 1;
	bh.biBitCount = 24;
	bh.biCompression = BI_RGB;
	BITMAPINFO bi = {};
	bi.bmiHeader = bh;
	bitmap = ::CreateDIBSection(screen_dc, &bi, DIB_RGB_COLORS, &bits, nullptr, 0);
	if (bitmap == nullptr || bits == nullptr) {
		cleanup();
		g_probe.json = "{\"ok\":false,\"error\":\"createdibsection_failed\"}";
		return g_probe.json.c_str();
	}
	{
		GdiBitmap *bmp_obj = reinterpret_cast<GdiBitmap *>(bitmap);
		g_probe.bitmapAllocated = true;
		g_probe.bitmapWidth = bmp_obj->width;
		g_probe.bitmapHeight = bmp_obj->height;
		g_probe.bitmapStride = bmp_obj->stride;
		g_probe.bitmapBytes = bmp_obj->pixels.size();
		g_probe.totalPixels = static_cast<std::size_t>(g_probe.bitmapWidth) * g_probe.bitmapHeight;
	}

	old_bitmap = reinterpret_cast<HBITMAP>(::SelectObject(mem_dc, reinterpret_cast<HGDIOBJ>(bitmap)));
	old_font = reinterpret_cast<HFONT>(::SelectObject(mem_dc, reinterpret_cast<HGDIOBJ>(font)));
	::SetBkColor(mem_dc, RGB(0, 0, 0));
	::SetTextColor(mem_dc, RGB(255, 255, 255));

	TEXTMETRIC tm = {};
	if (::GetTextMetrics(mem_dc, &tm)) {
		g_probe.metricsReported = true;
		g_probe.fontHeight = tm.tmHeight;
		g_probe.fontAscent = tm.tmAscent;
		g_probe.fontOverhang = tm.tmOverhang;
	}

	// Measure + rasterize each probe glyph exactly like Store_GDI_Char.
	int lastWidth = 0;
	bool any_rasterized = false;
	std::size_t total_coverage = 0;
	GdiBitmap *bmp_obj = reinterpret_cast<GdiBitmap *>(bitmap);
	for (char fc : g_probe.chars) {
		const WCHAR ch = static_cast<WCHAR>(fc);
		SIZE cs = {};
		if (::GetTextExtentPoint32W(mem_dc, &ch, 1, &cs)) {
			g_probe.measureReported = true;
			g_probe.measureCx = cs.cx;
			g_probe.measureCy = cs.cy;
			lastWidth = cs.cx;
		}
		RECT rect = {0, 0, g_probe.bitmapWidth, g_probe.bitmapHeight};
		::ExtTextOutW(mem_dc, 0, 0, ETO_OPAQUE, &rect, &ch, 1, nullptr);
		if (cnc_gdi_hook_installed()) {
			// Coverage over the glyph cell only; clamp to measured width.
			const int cellW = (lastWidth > 0 && lastWidth < g_probe.bitmapWidth) ? lastWidth : g_probe.bitmapWidth;
			total_coverage += count_nonzero_coverage(bmp_obj->pixels, bmp_obj->stride, g_probe.bitmapHeight, cellW);
			any_rasterized = true;
		}
	}
	g_probe.rasterized = any_rasterized;
	g_probe.glyphCoverage = total_coverage;

	// Sample the first pixel of the last drawn cell (FontCharsClass reads byte 0).
	if (!bmp_obj->pixels.empty()) {
		g_probe.sampleBlue = bmp_obj->pixels[0];
		g_probe.sampleGreen = bmp_obj->pixels[1];
		g_probe.sampleRed = bmp_obj->pixels[2];
	}

	g_probe.ok = g_probe.fontCreated && g_probe.bitmapAllocated && g_probe.metricsReported;

	cleanup();

	char buffer[768];
	std::snprintf(buffer, sizeof(buffer),
		"{\"ok\":%s,\"rasterizerInstalled\":%s,\"fontCreated\":%s,\"bitmapAllocated\":%s,"
		"\"metricsReported\":%s,\"measureReported\":%s,\"rasterized\":%s,"
		"\"fontHeight\":%d,\"fontAscent\":%d,\"fontOverhang\":%d,"
		"\"measureCx\":%d,\"measureCy\":%d,"
		"\"bitmapWidth\":%d,\"bitmapHeight\":%d,\"bitmapStride\":%d,"
		"\"bitmapBytes\":%zu,\"glyphCoverage\":%zu,\"totalPixels\":%zu,"
		"\"sampleBlue\":%d,\"sampleGreen\":%d,\"sampleRed\":%d,"
		"\"chars\":\"%s\",\"face\":\"%s\",\"pointSize\":%d}",
		g_probe.ok ? "true" : "false",
		g_probe.rasterizerInstalled ? "true" : "false",
		g_probe.fontCreated ? "true" : "false",
		g_probe.bitmapAllocated ? "true" : "false",
		g_probe.metricsReported ? "true" : "false",
		g_probe.measureReported ? "true" : "false",
		g_probe.rasterized ? "true" : "false",
		g_probe.fontHeight, g_probe.fontAscent, g_probe.fontOverhang,
		g_probe.measureCx, g_probe.measureCy,
		g_probe.bitmapWidth, g_probe.bitmapHeight, g_probe.bitmapStride,
		g_probe.bitmapBytes, g_probe.glyphCoverage, g_probe.totalPixels,
		g_probe.sampleBlue, g_probe.sampleGreen, g_probe.sampleRed,
		g_probe.chars.c_str(),
		face_name ? face_name : "Arial",
		point_size);
	g_probe.json = buffer;
	return g_probe.json.c_str();
}
