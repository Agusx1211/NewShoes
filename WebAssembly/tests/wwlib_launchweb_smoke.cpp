#include "LaunchWeb.h"

#include <iostream>

namespace {
bool expect_false(bool value, const char *message)
{
	if (value) {
		std::cerr << message << " should return false under browser shims\n";
		return false;
	}
	return true;
}
}

int main()
{
	if (!expect_false(LaunchWebBrowser(nullptr), "null URL") ||
		!expect_false(LaunchWebBrowser(""), "empty URL") ||
		!expect_false(LaunchWebBrowser("https://example.com"), "native launch URL")) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":\"LaunchWeb.cpp\","
		"\"nativeLaunchAvailable\":false,"
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
