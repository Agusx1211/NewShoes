#include <cstring>
#include <iostream>
#include <memory>

#include "data.h"
#include "iff.h"
#include "rawfile.h"
#include "rcfile.h"
#include "registry.h"

void * Hires_Load(FileClass &file);

namespace {
bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

bool write_file(const char *path, const void *data, int size)
{
	RawFileClass cleanup(path);
	cleanup.Delete();

	RawFileClass file(path);
	if (!file.Open(FileClass::WRITE)) {
		return false;
	}
	const bool wrote = file.Write(data, size) == size;
	file.Close();
	return wrote;
}

struct ArrayDeleter
{
	void operator()(void *data) const
	{
		delete[] static_cast<char *>(data);
	}
};
}

int main()
{
	const char raw_path[] = "wwlib_platform_data.tmp";
	const char raw_payload[] = "zero-hour-platform-data";
	if (!expect(write_file(raw_path, raw_payload, static_cast<int>(sizeof(raw_payload))),
			"raw data write failed")) {
		return 1;
	}

	{
		RawFileClass file(raw_path);
		if (!expect(file.Open(FileClass::READ), "raw data read open failed")) {
			return 1;
		}
		std::unique_ptr<void, ArrayDeleter> loaded(Load_Alloc_Data(file));
		if (!expect(loaded != nullptr &&
				std::memcmp(loaded.get(), raw_payload, sizeof(raw_payload)) == 0,
				"Load_Alloc_Data readback failed")) {
			return 1;
		}
		file.Close();
	}

	{
		RawFileClass file(raw_path);
		if (!expect(file.Open(FileClass::READ), "hires data read open failed")) {
			return 1;
		}
		std::unique_ptr<void, ArrayDeleter> loaded(Hires_Load(file));
		if (!expect(loaded != nullptr &&
				std::memcmp(loaded.get(), raw_payload, sizeof(raw_payload)) == 0,
				"Hires_Load readback failed")) {
			return 1;
		}
		file.Close();
	}

	const char compressed_path[] = "wwlib_platform_uncompress.tmp";
	const char uncompressed[] = "raw-cps-block";
	constexpr int uncompressed_size = sizeof(uncompressed) - 1;
	CompHeaderType header = {};
	header.Method = NOCOMPRESS;
	header.Size = uncompressed_size;
	header.Skip = 0;
	const unsigned short block_size = static_cast<unsigned short>(sizeof(header) + uncompressed_size);
	{
		RawFileClass cleanup(compressed_path);
		cleanup.Delete();
		RawFileClass file(compressed_path);
		if (!expect(file.Open(FileClass::WRITE), "compressed block write open failed")) {
			return 1;
		}
		const bool wrote =
			file.Write(&block_size, sizeof(block_size)) == static_cast<int>(sizeof(block_size)) &&
			file.Write(&header, sizeof(header)) == static_cast<int>(sizeof(header)) &&
			file.Write(uncompressed, uncompressed_size) == uncompressed_size;
		file.Close();
		if (!expect(wrote, "compressed block write failed")) {
			return 1;
		}
	}

	{
		RawFileClass file(compressed_path);
		Buffer scratch(sizeof(header) + uncompressed_size);
		Buffer dest(uncompressed_size);
		const long size = Load_Uncompress(file, scratch, dest, nullptr);
		if (!expect(size == uncompressed_size &&
				std::memcmp(dest.Get_Buffer(), uncompressed, uncompressed_size) == 0,
				"Load_Uncompress raw block failed")) {
			return 1;
		}
	}

	if (!expect(std::strcmp(Fetch_String(1234), "") == 0 &&
			Fetch_Resource("missing", "File") == nullptr,
			"browser string/resource fallback failed")) {
		return 1;
	}

	ResourceFileClass resource(nullptr, "missing.bin");
	if (!expect(!resource.Is_Open() && !resource.Is_Available(0),
			"ResourceFileClass unavailable fallback failed")) {
		return 1;
	}

	if (!expect(!RegistryClass::Exists("Software\\Electronic Arts\\Zero Hour"),
			"RegistryClass existence fallback failed")) {
		return 1;
	}
	RegistryClass::Set_Read_Only(true);
	RegistryClass registry("Software\\Electronic Arts\\Zero Hour", false);
	RegistryClass::Set_Read_Only(false);
	if (!expect(!registry.Is_Valid(), "RegistryClass invalid fallback failed")) {
		return 1;
	}

	{
		RawFileClass cleanup(raw_path);
		if (!expect(cleanup.Delete(), "raw data cleanup failed")) {
			return 1;
		}
	}
	{
		RawFileClass cleanup(compressed_path);
		if (!expect(cleanup.Delete(), "compressed block cleanup failed")) {
			return 1;
		}
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":\"data.cpp,rcfile.cpp,registry.cpp\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
