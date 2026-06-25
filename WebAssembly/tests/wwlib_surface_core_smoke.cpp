#include <array>
#include <cstring>
#include <iostream>
#include <memory>

#include "blit.h"
#include "bsurface.h"
#include "pcx.h"
#include "rawfile.h"

namespace {
bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

bool write_sample_pcx(const char *path)
{
	RawFileClass cleanup(path);
	cleanup.Delete();

	RawFileClass file(path);
	if (!file.Open(FileClass::WRITE)) {
		return false;
	}

	PCX_HEADER header = {};
	header.id = 10;
	header.version = 5;
	header.encoding = 1;
	header.pixelsize = 8;
	header.x = 0;
	header.y = 0;
	header.width = 1;
	header.height = 1;
	header.xres = 2;
	header.yres = 2;
	header.color_planes = 1;
	header.byte_per_line = 2;
	header.palette_type = 1;

	const std::array<unsigned char, 4> pixels = {1, 2, 3, 4};
	std::array<unsigned char, 256 * 3> palette = {};
	palette[3] = 11;
	palette[4] = 22;
	palette[5] = 33;

	const bool ok =
		file.Write(&header, sizeof(header)) == static_cast<int>(sizeof(header)) &&
		file.Write(pixels.data(), pixels.size()) == static_cast<int>(pixels.size()) &&
		file.Write(palette.data(), palette.size()) == static_cast<int>(palette.size());
	file.Close();
	return ok;
}
}

int main()
{
	BSurface source(4, 4, 1);
	if (!expect(source.Bytes_Per_Pixel() == 1 &&
			source.Stride() == 4 &&
			source.Get_Width() == 4 &&
			source.Get_Height() == 4,
			"BSurface dimensions failed")) {
		return 1;
	}

	if (!expect(source.Fill(0), "BSurface fill failed")) {
		return 1;
	}
	if (!expect(source.Put_Pixel(Point2D(1, 1), 7) &&
			source.Get_Pixel(Point2D(1, 1)) == 7,
			"BSurface pixel write/read failed")) {
		return 1;
	}
	if (!expect(source.Draw_Line(Point2D(0, 0), Point2D(3, 0), 5) &&
			source.Get_Pixel(Point2D(0, 0)) == 5 &&
			source.Get_Pixel(Point2D(3, 0)) == 5,
			"XSurface horizontal line failed")) {
		return 1;
	}
	if (!expect(source.Draw_Rect(Rect(1, 1, 2, 2), 9) &&
			source.Get_Pixel(Point2D(1, 1)) == 9 &&
			source.Get_Pixel(Point2D(2, 2)) == 9,
			"XSurface rectangle draw failed")) {
		return 1;
	}

	BSurface copied(4, 4, 1);
	copied.Fill(1);
	if (!expect(copied.Blit_From(source, false) &&
			copied.Get_Pixel(Point2D(1, 1)) == 9 &&
			copied.Get_Pixel(Point2D(3, 0)) == 5,
			"XSurface plain blit failed")) {
		return 1;
	}

	source.Put_Pixel(Point2D(2, 2), 0);
	BSurface transparent(4, 4, 1);
	transparent.Fill(8);
	if (!expect(transparent.Blit_From(source, true) &&
			transparent.Get_Pixel(Point2D(1, 1)) == 9 &&
			transparent.Get_Pixel(Point2D(2, 2)) == 8,
			"XSurface transparent blit failed")) {
		return 1;
	}

	Buffer buffer(Buffer_Size(source, 2, 2));
	if (!expect(To_Buffer(source, Rect(0, 0, 2, 2), buffer),
			"To_Buffer failed")) {
		return 1;
	}
	BSurface restored(4, 4, 1);
	restored.Fill(0);
	if (!expect(From_Buffer(restored, Rect(2, 2, 2, 2), buffer) &&
			restored.Get_Pixel(Point2D(2, 2)) == source.Get_Pixel(Point2D(0, 0)) &&
			restored.Get_Pixel(Point2D(3, 2)) == source.Get_Pixel(Point2D(1, 0)),
			"From_Buffer failed")) {
		return 1;
	}

	const char path[] = "wwlib_surface_core_smoke.pcx";
	if (!expect(write_sample_pcx(path), "sample PCX write failed")) {
		return 1;
	}

	PaletteClass palette;
	RawFileClass pcx_file(path);
	std::unique_ptr<Surface> pcx(Read_PCX_File(pcx_file, &palette));
	if (!expect(pcx != nullptr &&
			pcx->Get_Width() == 2 &&
			pcx->Get_Height() == 2,
			"PCX load dimensions failed")) {
		return 1;
	}
	if (!expect(pcx->Get_Pixel(Point2D(0, 0)) == 1 &&
			pcx->Get_Pixel(Point2D(1, 0)) == 2 &&
			pcx->Get_Pixel(Point2D(0, 1)) == 3 &&
			pcx->Get_Pixel(Point2D(1, 1)) == 4,
			"PCX pixel decode failed")) {
		return 1;
	}
	if (!expect(palette[1].Get_Red() == 11 &&
			palette[1].Get_Green() == 22 &&
			palette[1].Get_Blue() == 33,
			"PCX palette read failed")) {
		return 1;
	}

	RawFileClass cleanup(path);
	if (!expect(cleanup.Delete(), "PCX cleanup delete failed")) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":\"blit.cpp,pcx.cpp,surface.cpp,xsurface.cpp\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
