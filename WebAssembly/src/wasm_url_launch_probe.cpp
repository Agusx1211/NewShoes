#include <cstdio>
#include <cwchar>
#include <string>

#include "windows.h"
#include "Common/URLLaunch.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

namespace {

std::string g_url_launch_probe_json;

const char *bool_json(bool value)
{
	return value ? "true" : "false";
}

bool wide_equals(const WCHAR *left, const WCHAR *right)
{
	return left != nullptr && right != nullptr && std::wcscmp(left, right) == 0;
}

} // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_url_launch()
{
	WCHAR local_url[] = L"license path/file #1.wma";
	LPWSTR escaped_url = nullptr;
	const HRESULT escape_result = MakeEscapedURL(local_url, &escaped_url);
	const bool escaped_ok = SUCCEEDED(escape_result) &&
		wide_equals(escaped_url, L"file://license%20path/file%20%231.wma");

	const HRESULT null_launch = LaunchURL(nullptr);
	const HRESULT launch_result = LaunchURL(L"https://www.ea.com/games/command-and-conquer?source=cnc-port");
	const bool ok = escaped_ok && FAILED(null_launch) && SUCCEEDED(launch_result);

	char buffer[1024];
	std::snprintf(buffer, sizeof(buffer),
		"{\"ok\":%s,"
		"\"source\":\"GeneralsMD original Common/Audio/urllaunch.cpp\","
		"\"bridge\":\"window.open\","
		"\"escapedURL\":\"file://license%%20path/file%%20%%231.wma\","
		"\"escaped\":%s,"
		"\"nullLaunchFailed\":%s,"
		"\"browserURL\":\"https://www.ea.com/games/command-and-conquer?source=cnc-port\","
		"\"browserLaunch\":%s}",
		bool_json(ok),
		bool_json(escaped_ok),
		bool_json(FAILED(null_launch)),
		bool_json(SUCCEEDED(launch_result)));

	delete[] escaped_url;
	g_url_launch_probe_json = buffer;
	return g_url_launch_probe_json.c_str();
}

} // extern "C"
