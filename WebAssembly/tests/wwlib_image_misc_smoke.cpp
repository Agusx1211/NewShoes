#include <array>
#include <cstring>
#include <iostream>

#include "rawfile.h"
#include "targa.h"
#include "win.h"

namespace {
bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}
}

int main()
{
	if (!expect(ProgramInstance == nullptr &&
			MainWindow == nullptr &&
			GameInFocus == false,
			"win.cpp globals did not start in their default state")) {
		return 1;
	}
	GameInFocus = true;
	if (!expect(GameInFocus, "win.cpp focus global did not update")) {
		return 1;
	}
	GameInFocus = false;

	const char path[] = "wwlib_targa_smoke.tga";
	{
		RawFileClass cleanup(path);
		cleanup.Delete();
	}

	const std::array<char, 12> source = {
		10, 20, 30, 40, 50, 60,
		70, 80, 90, 100, 110, 120
	};
	std::array<char, source.size()> image = source;

	{
		Targa writer;
		writer.Header.ImageType = TGA_TRUECOLOR;
		writer.Header.Width = 2;
		writer.Header.Height = 2;
		writer.Header.PixelDepth = 24;
		writer.SetImage(image.data());
		if (!expect(writer.Save(path, TGAF_IMAGE, false) == 0,
				"Targa truecolor save failed")) {
			return 1;
		}
		if (!expect(image == source, "Targa save did not restore truecolor byte order")) {
			return 1;
		}
	}

	{
		Targa reader;
		if (!expect(reader.Load(path, TGAF_IMAGE) == 0,
				"Targa truecolor load failed")) {
			return 1;
		}
		if (!expect(reader.Header.Width == 2 &&
				reader.Header.Height == 2 &&
				reader.Header.PixelDepth == 24,
				"Targa header round-trip failed")) {
			return 1;
		}
		if (!expect(std::memcmp(reader.GetImage(), source.data(), source.size()) == 0,
				"Targa image round-trip failed")) {
			return 1;
		}

		reader.YFlip();
		const std::array<char, 12> y_flipped = {
			70, 80, 90, 100, 110, 120,
			10, 20, 30, 40, 50, 60
		};
		if (!expect(std::memcmp(reader.GetImage(), y_flipped.data(), y_flipped.size()) == 0,
				"Targa YFlip scanline swap failed")) {
			return 1;
		}

		reader.XFlip();
		const std::array<char, 12> xy_flipped = {
			100, 110, 120, 70, 80, 90,
			40, 50, 60, 10, 20, 30
		};
		if (!expect(std::memcmp(reader.GetImage(), xy_flipped.data(), xy_flipped.size()) == 0,
				"Targa XFlip pixel swap failed")) {
			return 1;
		}
	}

	{
		RawFileClass cleanup(path);
		if (!expect(cleanup.Delete(), "Targa cleanup delete failed")) {
			return 1;
		}
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":\"TARGA.CPP,win.cpp\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
