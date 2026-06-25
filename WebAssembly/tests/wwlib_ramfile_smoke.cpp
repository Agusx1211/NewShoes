#include <cstring>
#include <iostream>
#include <string>

#include "ramfile.h"

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
	char storage[32] = {};
	RAMFileClass file(storage, sizeof(storage));

	if (!expect(file.Is_Available() && !file.Is_Open(), "RAMFile availability/open state failed")) {
		return 1;
	}
	if (!expect(file.Create() && file.Size() == 0, "RAMFile create failed")) {
		return 1;
	}
	if (!expect(file.Open(FileClass::WRITE), "RAMFile write open failed")) {
		return 1;
	}
	if (!expect(file.Write("Zero", 4) == 4, "RAMFile initial write failed")) {
		return 1;
	}
	if (!expect(file.Seek(1, SEEK_CUR) == 5, "RAMFile seek while writing failed")) {
		return 1;
	}
	if (!expect(file.Write("Hour", 4) == 4, "RAMFile second write failed")) {
		return 1;
	}
	if (!expect(file.Size() == 9, "RAMFile write size failed")) {
		return 1;
	}
	file.Close();
	if (!expect(!file.Is_Open(), "RAMFile close failed")) {
		return 1;
	}

	if (!expect(file.Open(FileClass::READ), "RAMFile read open failed")) {
		return 1;
	}
	char read_back[10] = {};
	if (!expect(file.Read(read_back, sizeof(read_back)) == 9 &&
			std::string(read_back, sizeof(read_back)) == std::string("Zero\0Hour", 10),
			"RAMFile readback failed")) {
		return 1;
	}
	if (!expect(file.Read(read_back, sizeof(read_back)) == 0, "RAMFile read past end failed")) {
		return 1;
	}
	if (!expect(file.Seek(-4, SEEK_CUR) == 5, "RAMFile relative seek failed")) {
		return 1;
	}
	if (!expect(file.Read(read_back, 4) == 4 && std::string(read_back, 4) == "Hour",
			"RAMFile read after seek failed")) {
		return 1;
	}
	file.Close();

	RAMFileClass implicit_file(storage, sizeof(storage));
	if (!expect(implicit_file.Write("ABC", 3) == 3 && !implicit_file.Is_Open(),
			"RAMFile implicit write/close failed")) {
		return 1;
	}
	char implicit_read[4] = {};
	if (!expect(implicit_file.Read(implicit_read, sizeof(implicit_read)) == 3 &&
			std::string(implicit_read, 3) == "ABC" && !implicit_file.Is_Open(),
			"RAMFile implicit read/close failed")) {
		return 1;
	}

	RAMFileClass biased(storage, sizeof(storage));
	biased.Open(FileClass::READ | FileClass::WRITE);
	biased.Bias(1, 2);
	if (!expect(biased.Size() == 2 && biased.Seek(0, SEEK_SET) == 0,
			"RAMFile bias setup failed")) {
		return 1;
	}
	char biased_read[3] = {};
	if (!expect(biased.Read(biased_read, sizeof(biased_read)) == 2 &&
			std::string(biased_read, 2) == "BC",
			"RAMFile biased read failed")) {
		return 1;
	}
	biased.Close();

	RAMFileClass formatted(storage, sizeof(storage));
	if (!expect(formatted.Open(FileClass::WRITE), "RAMFile formatted open failed")) {
		return 1;
	}
	char format[] = "%s-%d";
	if (!expect(formatted.Printf(format, "GLA", 2) == 5 && formatted.Size() == 5,
			"RAMFile inherited Printf failed")) {
		return 1;
	}
	formatted.Close();

	RAMFileClass allocated(nullptr, 8);
	if (!expect(allocated.Open(FileClass::WRITE), "RAMFile allocated open failed")) {
		return 1;
	}
	if (!expect(allocated.Write("123456789", 9) == 8 && allocated.Size() == 8,
			"RAMFile allocated capacity clamp failed")) {
		return 1;
	}
	allocated.Close();
	if (!expect(allocated.Delete() && allocated.Size() == 0, "RAMFile delete failed")) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":\"ramfile.cpp\",\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
