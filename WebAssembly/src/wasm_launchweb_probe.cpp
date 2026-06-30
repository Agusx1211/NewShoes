#include <cstdio>
#include <string>

#include "LaunchWeb.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

namespace {

std::string g_launchweb_probe_json;

const char *bool_json(bool value)
{
	return value ? "true" : "false";
}

} // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_launch_web_browser()
{
	constexpr const char *url = "https://www.ea.com/games/command-and-conquer";
	const bool null_result = LaunchWebBrowser(nullptr);
	const bool empty_result = LaunchWebBrowser("");
	const bool browser_result = LaunchWebBrowser(url);
	const bool ok = !null_result && !empty_result && browser_result;

	char buffer[768];
	std::snprintf(buffer, sizeof(buffer),
		"{\"ok\":%s,"
		"\"source\":\"GeneralsMD original WWLib LaunchWeb.cpp\","
		"\"bridge\":\"window.open\","
		"\"nullUrl\":%s,"
		"\"emptyUrl\":%s,"
		"\"browserUrl\":\"%s\","
		"\"browserLaunch\":%s}",
		bool_json(ok),
		bool_json(null_result),
		bool_json(empty_result),
		url,
		bool_json(browser_result));
	g_launchweb_probe_json = buffer;
	return g_launchweb_probe_json.c_str();
}

} // extern "C"
