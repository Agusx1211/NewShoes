#include <cstddef>
#include <cstdio>
#include <string>
#include <vector>

#include "PreRTS.h"

#include "Common/GameMemory.h"
#include "assetmgr.h"
#include "render2dsentence.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

namespace {

std::string g_ww3d_font_chars_probe_json;

const char *bool_json(bool value)
{
	return value ? "true" : "false";
}

std::string json_escape(const char *value)
{
	std::string escaped;
	if (value == nullptr) {
		return escaped;
	}
	for (const char *cursor = value; *cursor != '\0'; ++cursor) {
		switch (*cursor) {
			case '\\':
				escaped += "\\\\";
				break;
			case '"':
				escaped += "\\\"";
				break;
			default:
				escaped += *cursor;
				break;
		}
	}
	return escaped;
}

std::size_t count_blit_coverage(const std::vector<uint16> &pixels)
{
	std::size_t coverage = 0;
	for (uint16 pixel : pixels) {
		if (pixel != 0) {
			++coverage;
		}
	}
	return coverage;
}

} // namespace

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_font_chars(
	int point_size,
	const char *face_name,
	int is_bold)
{
	initMemoryManager();

	const char *face = (face_name != nullptr && face_name[0] != '\0') ? face_name : "Arial";
	const int clamped_point_size = point_size > 0 ? point_size : 24;
	const bool bold = is_bold != 0;
	const WCHAR glyphs[] = {L'A', L'M', L'g', L'W'};
	constexpr int glyph_count = static_cast<int>(sizeof(glyphs) / sizeof(glyphs[0]));

	WW3DAssetManager *asset_manager = WW3DAssetManager::Get_Instance();
	const bool used_existing_asset_manager = asset_manager != nullptr;
	bool asset_manager_created = false;
	if (asset_manager == nullptr) {
		asset_manager = W3DNEW WW3DAssetManager();
		asset_manager_created = asset_manager != nullptr;
	}

	FontCharsClass *font = nullptr;
	bool font_created = false;
	int refs_after_get = 0;
	int char_height = 0;
	int positive_widths = 0;
	int positive_spacings = 0;
	int chars_with_coverage = 0;
	std::size_t blit_coverage = 0;
	int width_a = 0;
	int width_m = 0;
	int width_g = 0;
	int width_w = 0;
	int spacing_a = 0;
	int spacing_m = 0;
	int spacing_g = 0;
	int spacing_w = 0;

	if (asset_manager != nullptr) {
		font = asset_manager->Get_FontChars(face, clamped_point_size, bold);
		font_created = font != nullptr;
	}

	if (font != nullptr) {
		refs_after_get = font->Num_Refs();
		char_height = font->Get_Char_Height();

		for (int index = 0; index < glyph_count; ++index) {
			const WCHAR ch = glyphs[index];
			const int width = font->Get_Char_Width(ch);
			const int spacing = font->Get_Char_Spacing(ch);
			if (width > 0) {
				++positive_widths;
			}
			if (spacing > 0) {
				++positive_spacings;
			}

			switch (index) {
				case 0:
					width_a = width;
					spacing_a = spacing;
					break;
				case 1:
					width_m = width;
					spacing_m = spacing;
					break;
				case 2:
					width_g = width;
					spacing_g = spacing;
					break;
				case 3:
					width_w = width;
					spacing_w = spacing;
					break;
			}

			const int dest_width = width > 0 ? width : clamped_point_size * 2;
			const int dest_height = char_height > 0 ? char_height : clamped_point_size * 2;
			std::vector<uint16> blit_pixels(static_cast<std::size_t>(dest_width) * dest_height, 0);
			font->Blit_Char(ch, blit_pixels.data(), dest_width * static_cast<int>(sizeof(uint16)), 0, 0);
			const std::size_t coverage = count_blit_coverage(blit_pixels);
			if (coverage > 0) {
				++chars_with_coverage;
			}
			blit_coverage += coverage;
		}

		font->Release_Ref();
		font = nullptr;
	}

	if (asset_manager_created && asset_manager != nullptr) {
		delete asset_manager;
		asset_manager = nullptr;
	}

	const bool ok =
		asset_manager_created &&
		!used_existing_asset_manager &&
		font_created &&
		char_height > 0 &&
		positive_widths == glyph_count &&
		chars_with_coverage == glyph_count &&
		blit_coverage > 0;

	const std::string escaped_face = json_escape(face);
	char buffer[1600];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_font_chars_probe\","
		"\"ok\":%s,"
		"\"face\":\"%s\","
		"\"pointSize\":%d,"
		"\"bold\":%s,"
		"\"assetManagerCreated\":%s,"
		"\"usedExistingAssetManager\":%s,"
		"\"fontCreated\":%s,"
		"\"refsAfterGet\":%d,"
		"\"charHeight\":%d,"
		"\"glyphCount\":%d,"
		"\"positiveWidths\":%d,"
		"\"positiveSpacings\":%d,"
		"\"charsWithCoverage\":%d,"
		"\"blitCoverage\":%zu,"
		"\"glyphs\":{"
		"\"A\":{\"width\":%d,\"spacing\":%d},"
		"\"M\":{\"width\":%d,\"spacing\":%d},"
		"\"g\":{\"width\":%d,\"spacing\":%d},"
		"\"W\":{\"width\":%d,\"spacing\":%d}"
		"}}",
		bool_json(ok),
		escaped_face.c_str(),
		clamped_point_size,
		bool_json(bold),
		bool_json(asset_manager_created),
		bool_json(used_existing_asset_manager),
		bool_json(font_created),
		refs_after_get,
		char_height,
		glyph_count,
		positive_widths,
		positive_spacings,
		chars_with_coverage,
		blit_coverage,
		width_a,
		spacing_a,
		width_m,
		spacing_m,
		width_g,
		spacing_g,
		width_w,
		spacing_w);
	g_ww3d_font_chars_probe_json = buffer;
	return g_ww3d_font_chars_probe_json.c_str();
}
