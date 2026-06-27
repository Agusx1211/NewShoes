#include "wwfont.h"

#include <array>
#include <cstdint>
#include <iostream>

namespace {
constexpr std::size_t HeaderSize = 14;
constexpr std::size_t InfoOffset = HeaderSize;
constexpr std::size_t WidthOffset = InfoOffset + 6;
constexpr std::size_t OffsetOffset = WidthOffset + 256;
constexpr std::size_t HeightOffset = OffsetOffset + 512;
constexpr std::size_t DataOffset = HeightOffset + 512;

void put_u16(std::array<unsigned char, DataOffset> &font, std::size_t offset, std::uint16_t value)
{
	font[offset] = static_cast<unsigned char>(value & 0xffU);
	font[offset + 1] = static_cast<unsigned char>((value >> 8U) & 0xffU);
}

std::array<unsigned char, DataOffset> make_font_data()
{
	std::array<unsigned char, DataOffset> font{};
	put_u16(font, 0, static_cast<std::uint16_t>(font.size()));
	font[2] = 0;
	font[3] = 4;
	put_u16(font, 4, static_cast<std::uint16_t>(InfoOffset));
	put_u16(font, 6, static_cast<std::uint16_t>(OffsetOffset));
	put_u16(font, 8, static_cast<std::uint16_t>(WidthOffset));
	put_u16(font, 10, static_cast<std::uint16_t>(DataOffset));
	put_u16(font, 12, static_cast<std::uint16_t>(HeightOffset));

	font[InfoOffset + 4] = 7;
	font[InfoOffset + 5] = 9;
	font[WidthOffset + static_cast<unsigned char>('A')] = 5;
	font[WidthOffset + static_cast<unsigned char>('B')] = 3;
	font[WidthOffset + static_cast<unsigned char>(' ')] = 2;
	return font;
}

bool expect_equal(int actual, int expected, const char *message)
{
	if (actual != expected) {
		std::cerr << message << ": expected " << expected << ", got " << actual << '\n';
		return false;
	}
	return true;
}
}

int main()
{
	alignas(2) std::array<unsigned char, DataOffset> font_data = make_font_data();
	WWFontClass font(font_data.data());

	if (!expect_equal(font.Get_Width(), 9, "raw font width") ||
		!expect_equal(font.Get_Height(), 7, "raw font height") ||
		!expect_equal(font.Char_Pixel_Width('A'), 5, "A width") ||
		!expect_equal(font.String_Pixel_Width("A B"), 10, "single-line width") ||
		!expect_equal(font.String_Pixel_Width("A\nB"), 5, "multi-line widest width")) {
		return 1;
	}

	if (!expect_equal(font.Set_XSpacing(2), 0, "old x spacing") ||
		!expect_equal(font.Char_Pixel_Width('A'), 7, "spaced A width") ||
		!expect_equal(font.Get_Width(), 11, "spaced font width")) {
		return 1;
	}

	if (!expect_equal(font.Set_YSpacing(3), 0, "old y spacing") ||
		!expect_equal(font.Get_Height(), 10, "spaced font height")) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":\"wwfont.cpp\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
