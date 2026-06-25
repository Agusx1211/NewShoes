#include <algorithm>
#include <cstring>
#include <iostream>
#include <string>
#include <vector>

#include "buff.h"
#include "wwfile.h"

namespace {
class MemoryFileClass : public FileClass
{
public:
	char const *File_Name() const override { return Name.c_str(); }
	char const *Set_Name(char const *filename) override
	{
		Name = filename != nullptr ? filename : "";
		return Name.c_str();
	}
	int Create() override
	{
		Data.clear();
		Position = 0;
		OpenFlag = true;
		return true;
	}
	int Delete() override
	{
		Data.clear();
		Position = 0;
		OpenFlag = false;
		return true;
	}
	bool Is_Available(int = false) override { return true; }
	bool Is_Open() const override { return OpenFlag; }
	int Open(char const *filename, int rights = READ) override
	{
		Set_Name(filename);
		return Open(rights);
	}
	int Open(int = READ) override
	{
		OpenFlag = true;
		Position = 0;
		return true;
	}
	int Read(void *buffer, int size) override
	{
		if (buffer == nullptr || size <= 0) {
			return 0;
		}
		const int available = static_cast<int>(Data.size()) - Position;
		const int amount = std::max(0, std::min(size, available));
		if (amount == 0) {
			return 0;
		}
		std::memcpy(buffer, Data.data() + Position, static_cast<std::size_t>(amount));
		Position += amount;
		return amount;
	}
	int Seek(int pos, int dir = SEEK_CUR) override
	{
		int base = 0;
		if (dir == SEEK_CUR) {
			base = Position;
		} else if (dir == SEEK_END) {
			base = static_cast<int>(Data.size());
		}

		Position = std::max(0, std::min(base + pos, static_cast<int>(Data.size())));
		return Position;
	}
	int Size() override { return static_cast<int>(Data.size()); }
	int Write(void const *buffer, int size) override
	{
		if (buffer == nullptr || size <= 0) {
			return 0;
		}
		const int end = Position + size;
		if (end > static_cast<int>(Data.size())) {
			Data.resize(static_cast<std::size_t>(end));
		}
		std::memcpy(Data.data() + Position, buffer, static_cast<std::size_t>(size));
		Position = end;
		return size;
	}
	void Close() override { OpenFlag = false; }

	std::string Contents() const
	{
		return std::string(Data.begin(), Data.end());
	}

private:
	std::string Name = "memory";
	std::vector<char> Data;
	int Position = 0;
	bool OpenFlag = false;
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
	Buffer owned(8);
	if (!expect(owned.Is_Valid() && owned.Get_Size() == 8, "owned Buffer allocation failed")) {
		return 1;
	}
	std::memcpy(static_cast<char *>(owned), "Generals", 8);

	Buffer view(owned);
	if (!expect(view.Get_Buffer() == owned.Get_Buffer() && view.Get_Size() == 8,
			"Buffer copy should reference the original memory")) {
		return 1;
	}

	Buffer assigned;
	assigned = view;
	if (!expect(assigned.Get_Buffer() == owned.Get_Buffer() && assigned.Get_Size() == 8,
			"Buffer assignment should reference the original memory")) {
		return 1;
	}

	owned.Reset();
	if (!expect(!owned.Is_Valid() && owned.Get_Size() == 0, "Buffer reset failed")) {
		return 1;
	}

	MemoryFileClass file;
	if (!expect(file.Open("memory.out", FileClass::WRITE) && file.Is_Open(),
			"Memory file did not open")) {
		return 1;
	}

	char format_zero[] = "%s-%d";
	if (!expect(file.Printf(format_zero, "USA", 1) == 5,
			"FileClass::Printf returned an unexpected length")) {
		return 1;
	}

	char scratch[64] = {};
	char format_one[] = "|%s:%d|";
	if (!expect(file.Printf(scratch, sizeof(scratch), format_one, "GLA", 2) == 7,
			"FileClass::Printf with caller buffer returned an unexpected length")) {
		return 1;
	}

	char format_two[] = "%s";
	if (!expect(file.Printf_Indented(2, format_two, "China") == 7,
			"FileClass::Printf_Indented returned an unexpected length")) {
		return 1;
	}

	if (!expect(file.Contents() == "USA-1|GLA:2|\t\tChina",
			"FileClass formatted output mismatch")) {
		return 1;
	}

	file.Seek(0, SEEK_SET);
	char read_buffer[6] = {};
	if (!expect(file.Read(read_buffer, 5) == 5 && std::string(read_buffer, 5) == "USA-1",
			"Memory file readback failed")) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":[\"buff.cpp\",\"wwfile.cpp\"],"
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
