#include <cstdint>
#include <cstdio>
#include <cstring>

#include "Mss.H"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

namespace {
char g_mss_startup_probe_json[4096] = {};

U32 AILCALLBACK probe_file_open(char const *, U32 *file_handle)
{
	if (file_handle != nullptr) {
		*file_handle = 1;
	}
	return 1;
}

void AILCALLBACK probe_file_close(U32) {}

S32 AILCALLBACK probe_file_seek(U32, S32 offset, U32)
{
	return offset;
}

U32 AILCALLBACK probe_file_read(U32, void *, U32 bytes)
{
	return bytes;
}

bool handle_valid(std::uintptr_t handle)
{
	return MSSBrowserHandleValid(handle);
}
}

extern "C" {

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_mss_startup()
{
	MSSBrowserRuntimeReset();

	AIL_set_redist_directory("MSS\\");
	AIL_startup();
	const S32 quick_startup_result = AIL_quick_startup(1, 0, 44100, 16, 2);

	HDIGDRIVER digital = nullptr;
	AIL_quick_handles(&digital, nullptr, nullptr);

	HPROENUM next = HPROENUM_FIRST;
	HPROVIDER provider = 0;
	HPROVIDER preferred_provider = 0;
	char *name = nullptr;
	int provider_count = 0;
	char preferred_provider_name[96] = {};
	while (AIL_enumerate_3D_providers(&next, &provider, &name)) {
		++provider_count;
		if (name != nullptr && std::strcmp(name, "Miles Fast 2D Positional Audio") == 0) {
			preferred_provider = provider;
			std::snprintf(preferred_provider_name, sizeof(preferred_provider_name), "%s", name);
		}
	}

	const S32 provider_open_result = AIL_open_3D_provider(preferred_provider);
	const H3DPOBJECT listener = AIL_open_3D_listener(preferred_provider);
	const HSAMPLE sample_2d = AIL_allocate_sample_handle(digital);
	const H3DSAMPLE sample_3d = AIL_allocate_3D_sample_handle(preferred_provider);
	AIL_set_file_callbacks(probe_file_open, probe_file_close, probe_file_seek, probe_file_read);

	const MSSBrowserRuntimeState before_shutdown = MSSBrowserRuntime();
	AIL_shutdown();
	const MSSBrowserRuntimeState after_shutdown = MSSBrowserRuntime();

	const bool digital_handle_ready =
		digital != nullptr &&
		digital->emulated_ds == TRUE &&
		digital->output_rate == 44100 &&
		digital->output_bits == 16 &&
		digital->output_channels == 2;
	const bool ok =
		before_shutdown.redist_directory_set &&
		before_shutdown.startup_called &&
		before_shutdown.quick_startup_called &&
		before_shutdown.quick_startup_ok &&
		quick_startup_result == 1 &&
		digital_handle_ready &&
		provider_count >= 1 &&
		preferred_provider == 1 &&
		provider_open_result == M3D_NOERR &&
		handle_valid(listener) &&
		handle_valid(sample_2d) &&
		handle_valid(sample_3d) &&
		before_shutdown.file_callbacks_set &&
		after_shutdown.shutdown_called &&
		!after_shutdown.quick_startup_ok;

	std::snprintf(g_mss_startup_probe_json, sizeof(g_mss_startup_probe_json),
		"{\"ok\":%s,"
		"\"source\":\"Mss.H browser startup handle contract probe\","
		"\"runtimeReady\":false,"
		"\"startupBoundaryReady\":%s,"
		"\"playbackReady\":false,"
		"\"nextRequired\":\"webAudioPlaybackBackend\","
		"\"calls\":{\"AIL_set_redist_directory\":%s,"
		"\"AIL_startup\":%s,"
		"\"AIL_quick_startup\":%s,"
		"\"AIL_quick_handles\":%s,"
		"\"AIL_enumerate_3D_providers\":%d,"
		"\"AIL_open_3D_provider\":%s,"
		"\"AIL_open_3D_listener\":%s,"
		"\"AIL_allocate_sample_handle\":%s,"
		"\"AIL_allocate_3D_sample_handle\":%s,"
		"\"AIL_set_file_callbacks\":%s,"
		"\"AIL_shutdown\":%s},"
		"\"quickStartup\":{\"result\":%d,\"useDigital\":%d,\"useMidi\":%d,"
		"\"outputRate\":%d,\"outputBits\":%d,\"outputChannels\":%d},"
		"\"digitalHandle\":{\"nonNull\":%s,\"emulatedDirectSound\":%s,"
		"\"outputRate\":%d,\"outputBits\":%d,\"outputChannels\":%d},"
		"\"provider\":{\"count\":%d,\"preferredName\":\"%s\","
		"\"preferredHandle\":%llu,\"openResult\":%d},"
		"\"handles\":{\"listener\":%llu,\"sample2D\":%llu,\"sample3D\":%llu},"
		"\"shutdown\":{\"called\":%s,\"quickStartupActive\":%s}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		before_shutdown.redist_directory_set ? "true" : "false",
		before_shutdown.startup_called ? "true" : "false",
		before_shutdown.quick_startup_called ? "true" : "false",
		digital != nullptr ? "true" : "false",
		provider_count,
		provider_open_result == M3D_NOERR ? "true" : "false",
		handle_valid(listener) ? "true" : "false",
		handle_valid(sample_2d) ? "true" : "false",
		handle_valid(sample_3d) ? "true" : "false",
		before_shutdown.file_callbacks_set ? "true" : "false",
		after_shutdown.shutdown_called ? "true" : "false",
		quick_startup_result,
		before_shutdown.use_digital,
		before_shutdown.use_midi,
		before_shutdown.output_rate,
		before_shutdown.output_bits,
		before_shutdown.output_channels,
		digital != nullptr ? "true" : "false",
		digital != nullptr && digital->emulated_ds == TRUE ? "true" : "false",
		digital != nullptr ? digital->output_rate : 0,
		digital != nullptr ? digital->output_bits : 0,
		digital != nullptr ? digital->output_channels : 0,
		provider_count,
		preferred_provider_name,
		static_cast<unsigned long long>(preferred_provider),
		provider_open_result,
		static_cast<unsigned long long>(listener),
		static_cast<unsigned long long>(sample_2d),
		static_cast<unsigned long long>(sample_3d),
		after_shutdown.shutdown_called ? "true" : "false",
		after_shutdown.quick_startup_ok ? "true" : "false");

	return g_mss_startup_probe_json;
}

}
