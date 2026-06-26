#include <cstdint>
#include <cstdio>
#include <string>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

namespace {
bool g_booted = false;
std::uint32_t g_frame = 0;
std::string g_state_json;

const char *write_state_json()
{
	char buffer[256];
	std::snprintf(buffer, sizeof(buffer),
		"{\"booted\":%s,\"frame\":%u,\"module\":\"wasm-port-skeleton\","
		"\"originalEngineLinked\":false}",
		g_booted ? "true" : "false",
		g_frame);
	g_state_json = buffer;
	return g_state_json.c_str();
}
}

extern "C" {

EMSCRIPTEN_KEEPALIVE const char *cnc_port_boot()
{
	g_booted = true;
	++g_frame;
	return write_state_json();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_frame()
{
	if (g_booted) {
		++g_frame;
	}
	return write_state_json();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_state()
{
	return write_state_json();
}

}
