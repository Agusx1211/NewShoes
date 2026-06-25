#include <cstring>
#include <iostream>
#include <string>

#include "wwstring.h"

namespace {
bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

std::string as_string(const StringClass &value)
{
	return static_cast<const char *>(value);
}
}

int main()
{
	StringClass greeting("Zero");
	greeting += " Hour";
	if (!expect(as_string(greeting) == "Zero Hour", "StringClass append failed")) {
		return 1;
	}
	if (!expect(greeting.Get_Length() == 9, "StringClass cached length failed")) {
		return 1;
	}

	StringClass erased("ZeroXHour");
	erased.Erase(4, 1);
	if (!expect(as_string(erased) == "ZeroHour", "StringClass erase failed")) {
		return 1;
	}

	StringClass formatted;
	const int format_result = formatted.Format("%s-%d", "GLA", 7);
	if (!expect(format_result == 5 && as_string(formatted) == "GLA-7",
			"StringClass format failed")) {
		return 1;
	}

	StringClass mixed_case("CommandCenter");
	if (!expect(mixed_case.Compare_No_Case("commandcenter") == 0,
			"StringClass case-insensitive compare failed")) {
		return 1;
	}
	if (!expect(mixed_case.Compare("CommandCenter") == 0,
			"StringClass case-sensitive compare failed")) {
		return 1;
	}

	StringClass combined = StringClass("Battle") + " Bus";
	if (!expect(as_string(combined) == "Battle Bus", "StringClass operator+ failed")) {
		return 1;
	}

	StringClass trimmed("  generals zh  ");
	trimmed.Trim();
	if (!expect(as_string(trimmed) == "generals zh", "StringClass trim failed")) {
		return 1;
	}

	StringClass manual;
	char *buffer = manual.Get_Buffer(6);
	std::strcpy(buffer, "China");
	if (!expect(manual.Get_Length() == 5 && as_string(manual) == "China",
			"StringClass manual buffer growth failed")) {
		return 1;
	}

	StringClass copied(manual);
	copied[0] = 'c';
	if (!expect(as_string(manual) == "China" && as_string(copied) == "china",
			"StringClass copy or index mutation failed")) {
		return 1;
	}

	StringClass wide;
	if (!expect(wide.Copy_Wide(L"USA") && as_string(wide) == "USA",
			"StringClass wide copy failed")) {
		return 1;
	}

	StringClass unmapped_wide;
	if (!expect(!unmapped_wide.Copy_Wide(L"\u00e9") && as_string(unmapped_wide) == "?",
			"StringClass unmapped wide copy failed")) {
		return 1;
	}

	StringClass temporary("temp", true);
	temporary += "-string";
	if (!expect(as_string(temporary) == "temp-string",
			"StringClass temporary buffer path failed")) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":[\"wwstring.cpp\",\"trim.cpp\"],"
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
