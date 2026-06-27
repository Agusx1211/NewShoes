#include "regexpr.h"

#include <iostream>

namespace {
bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << '\n';
	}
	return condition;
}
} // namespace

int main()
{
	RegularExpressionClass side("^(USA|China|GLA)[0-9]{2}");
	if (!expect(side.Is_Valid(), "side regex did not compile")) {
		return 1;
	}
	if (!expect(side.Match("USA07General"), "side regex should prefix-match USA07General")) {
		return 1;
	}
	if (!expect(!side.Match("Boss07"), "side regex should reject Boss07")) {
		return 1;
	}

	RegularExpressionClass alpha("[[:alpha:]]+");
	if (!expect(alpha.Is_Valid() && alpha.Match("Generals123"),
			"alpha character class should prefix-match")) {
		return 1;
	}

	RegularExpressionClass invalid("[z-a]");
	if (!expect(!invalid.Is_Valid(), "invalid range should fail to compile")) {
		return 1;
	}

	RegularExpressionClass copy(side);
	if (!expect(copy == side && copy.Match("GLA12Worker"),
			"copy construction should preserve compiled expression")) {
		return 1;
	}

	RegularExpressionClass assigned;
	assigned = alpha;
	if (!expect(assigned == alpha && assigned != side && assigned.Match("China"),
			"assignment should preserve expression identity and matching")) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":\"regexpr.cpp\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
