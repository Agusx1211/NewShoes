#include <algorithm>
#include <cstring>
#include <iostream>
#include <string>
#include <vector>

#include "ini.h"
#include "pipe.h"
#include "point.h"
#include "rawfile.h"
#include "straw.h"
#include "trect.h"

namespace {
class MemoryPipe : public Pipe
{
public:
	int Put(void const *source, int length) override
	{
		if (source == nullptr || length <= 0) {
			return 0;
		}
		const auto *bytes = static_cast<const char *>(source);
		Data.append(bytes, static_cast<size_t>(length));
		return length;
	}

	std::string Data;
};

class MemoryStraw : public Straw
{
public:
	MemoryStraw(const char *source, int length) :
		Data(source, source + length),
		Offset(0)
	{
	}

	int Get(void *buffer, int length) override
	{
		if (buffer == nullptr || length <= 0 || Offset >= Data.size()) {
			return 0;
		}
		const int available = static_cast<int>(Data.size() - Offset);
		const int copied = std::min(length, available);
		std::memcpy(buffer, Data.data() + Offset, copied);
		Offset += copied;
		return copied;
	}

private:
	std::vector<char> Data;
	size_t Offset;
};

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
	const char path[] = "wwlib_file_ini_smoke.tmp";
	const char file_text[] = "Alpha\nBeta\nGamma\n";

	{
		RawFileClass file(path);
		file.Delete();
		if (!expect(file.Open(FileClass::WRITE), "RawFileClass write open failed")) {
			return 1;
		}
		if (!expect(file.Write(file_text, sizeof(file_text) - 1) == static_cast<int>(sizeof(file_text) - 1),
				"RawFileClass write failed")) {
			return 1;
		}
		file.Close();
	}

	{
		RawFileClass file(path);
		if (!expect(file.Open(FileClass::READ), "RawFileClass read open failed")) {
			return 1;
		}
		if (!expect(file.Size() == static_cast<int>(sizeof(file_text) - 1),
				"RawFileClass size failed")) {
			return 1;
		}
		if (!expect(file.Seek(6, SEEK_SET) == 6, "RawFileClass seek failed")) {
			return 1;
		}
		char buffer[5] = {};
		if (!expect(file.Read(buffer, 4) == 4 && std::string(buffer, 4) == "Beta",
				"RawFileClass readback failed")) {
			return 1;
		}
		file.Close();
		if (!expect(file.Delete(), "RawFileClass delete failed")) {
			return 1;
		}
	}

	const char ini_text[] =
		"; comment before first section\n"
		"[Player]\n"
		"Name=China\n"
		"Enabled=yes\n"
		"Count=42\n"
		"Ratio=1.5\n"
		"Origin=7,8,9\n"
		"Screen=3,4,640,480\n"
		"\n"
		"[Binary]\n"
		"Data=payload\n";

	MemoryStraw source(ini_text, static_cast<int>(sizeof(ini_text) - 1));
	INIClass ini;
	if (!expect(ini.Load(source) != 0, "INIClass Load(Straw) failed")) {
		return 1;
	}
	if (!expect(ini.Section_Count() == 2 &&
			ini.Entry_Count("Player") == 6 &&
			ini.Is_Present("Binary", "Data"),
			"INIClass section or entry indexing failed")) {
		return 1;
	}

	char name[32] = {};
	if (!expect(ini.Get_String("Player", "Name", "", name, sizeof(name)) == 5 &&
			std::string(name) == "China",
			"INIClass Get_String failed")) {
		return 1;
	}
	if (!expect(ini.Get_Bool("Player", "Enabled", false) &&
			ini.Get_Int("Player", "Count", 0) == 42,
			"INIClass scalar reads failed")) {
		return 1;
	}
	if (!expect(ini.Get_Float("Player", "Ratio", 0.0f) > 1.49f &&
			ini.Get_Float("Player", "Ratio", 0.0f) < 1.51f,
			"INIClass float read failed")) {
		return 1;
	}

	const Point3D origin = ini.Get_Point("Player", "Origin", Point3D(0, 0, 0));
	if (!expect(origin.X == 7 && origin.Y == 8 && origin.Z == 9,
			"INIClass 3D point read failed")) {
		return 1;
	}
	const Rect rect = ini.Get_Rect("Player", "Screen", Rect(0, 0, 0, 0));
	if (!expect(rect.X == 3 && rect.Y == 4 && rect.Width == 640 && rect.Height == 480,
			"INIClass rect read failed")) {
		return 1;
	}

	if (!expect(ini.Put_Int("Player", "Count", 43) &&
			ini.Get_Int("Player", "Count", 0) == 43,
			"INIClass Put_Int failed")) {
		return 1;
	}

	MemoryPipe saved;
	if (!expect(ini.Save(saved) > 0 &&
			saved.Data.find("[Player]") != std::string::npos &&
			saved.Data.find("Count=43") != std::string::npos,
			"INIClass Save(Pipe) failed")) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":\"file helpers and INI parser\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
