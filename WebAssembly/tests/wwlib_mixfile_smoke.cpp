#include <cstring>
#include <iostream>

#include "ffactory.h"
#include "mixfile.h"
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

bool write_file(const char *path, const char *data)
{
	RawFileClass file(path);
	file.Delete();
	if (!file.Open(FileClass::WRITE)) {
		return false;
	}
	const int length = static_cast<int>(std::strlen(data));
	const bool ok = file.Write(data, length) == length;
	file.Close();
	return ok;
}

bool read_mix_file(MixFileFactoryClass &mix, const char *path, const char *expected)
{
	FileClass *file = mix.Get_File(path);
	if (file == nullptr) {
		return false;
	}
	bool ok = file->Open(FileClass::READ);
	char buffer[64] = {};
	const int expected_length = static_cast<int>(std::strlen(expected));
	ok = ok &&
		file->Size() == expected_length &&
		file->Read(buffer, expected_length) == expected_length &&
		std::memcmp(buffer, expected, static_cast<std::size_t>(expected_length)) == 0;
	file->Close();
	mix.Return_File(file);
	return ok;
}

bool list_contains(const DynamicVectorClass<StringClass> &list, const char *name)
{
	for (int index = 0; index < list.Count(); ++index) {
		if (list[index].Compare_No_Case(name) == 0) {
			return true;
		}
	}
	return false;
}
}

int main()
{
	const char alpha_path[] = "wwlib_mixfile_alpha.tmp";
	const char beta_path[] = "wwlib_mixfile_beta.tmp";
	const char mix_path[] = "wwlib_mixfile_smoke.mix";
	const char alpha_name[] = "Data\\Alpha.txt";
	const char beta_name[] = "Data\\Beta.txt";
	const char alpha_data[] = "Alpha payload\n";
	const char beta_data[] = "Beta payload with more bytes\n";

	RawFileClass(mix_path).Delete();
	if (!expect(write_file(alpha_path, alpha_data), "failed to write alpha source file")) {
		return 1;
	}
	if (!expect(write_file(beta_path, beta_data), "failed to write beta source file")) {
		return 1;
	}

	{
		MixFileCreator creator(mix_path);
		creator.Add_File(alpha_path, alpha_name);
		creator.Add_File(beta_path, beta_name);
	}

	SimpleFileFactoryClass factory;
	MixFileFactoryClass mix(mix_path, &factory);
	if (!expect(mix.Is_Valid(), "MixFileFactoryClass did not load created MIX archive")) {
		return 1;
	}

	DynamicVectorClass<StringClass> names;
	if (!expect(mix.Build_Filename_List(names) && names.Count() == 2,
			"MIX filename list did not contain expected entries")) {
		return 1;
	}
	if (!expect(list_contains(names, alpha_name) && list_contains(names, beta_name),
			"MIX filename list missing saved names")) {
		return 1;
	}

	DynamicVectorClass<StringClass> ordered_names;
	if (!expect(mix.Build_Ordered_Filename_List(ordered_names) &&
			ordered_names.Count() == 2 &&
			ordered_names[0].Compare_No_Case(alpha_name) == 0 &&
			ordered_names[1].Compare_No_Case(beta_name) == 0,
			"MIX ordered filename list did not preserve data offsets")) {
		return 1;
	}

	if (!expect(read_mix_file(mix, alpha_name, alpha_data),
			"MIX alpha subfile readback failed")) {
		return 1;
	}
	if (!expect(read_mix_file(mix, beta_name, beta_data),
			"MIX beta subfile readback failed")) {
		return 1;
	}
	if (!expect(mix.Get_File("Data\\Missing.txt") == nullptr,
			"MIX missing file lookup unexpectedly succeeded")) {
		return 1;
	}

	RawFileClass(alpha_path).Delete();
	RawFileClass(beta_path).Delete();
	RawFileClass(mix_path).Delete();

	std::cout << "{\"ok\":true,\"library\":\"WWLib\",\"compiled\":\"mixfile.cpp\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
