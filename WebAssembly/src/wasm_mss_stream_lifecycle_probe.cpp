#include <cstdint>
#include <cstdio>

#include "Mss.H"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

namespace {
char g_mss_stream_lifecycle_probe_json[4096] = {};
int g_stream_callback_count = 0;
HSTREAM g_stream_callback_last_handle = 0;

void AILCALLBACK probe_stream_callback(HSTREAM stream)
{
	++g_stream_callback_count;
	g_stream_callback_last_handle = stream;
}

bool handle_valid(std::uintptr_t handle)
{
	return MSSBrowserHandleValid(handle);
}
}

extern "C" {

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_mss_stream_lifecycle()
{
	MSSBrowserRuntimeReset();
	g_stream_callback_count = 0;
	g_stream_callback_last_handle = 0;

	AIL_startup();
	const S32 quick_startup_result = AIL_quick_startup(1, 0, 44100, 16, 2);

	HDIGDRIVER digital = nullptr;
	AIL_quick_handles(&digital, nullptr, nullptr);

	HSTREAM stream = AIL_open_stream(digital, "Data\\Audio\\Tracks\\ProbeStream.mp3", 0);
	const bool stream_allocated = handle_valid(stream);

	const AIL_stream_callback previous_callback =
		AIL_register_stream_callback(stream, probe_stream_callback);

	AIL_set_stream_volume(stream, 88);
	AIL_set_stream_pan(stream, 48);
	AIL_set_stream_volume_pan(stream, 0.75f, 0.375f);
	AIL_set_stream_playback_rate(stream, 32000);
	AIL_set_stream_loop_block(stream, 5, 125);
	AIL_set_stream_loop_count(stream, 2);
	AIL_set_stream_ms_position(stream, 250);

	F32 volume_pan_volume = 0.0f;
	F32 volume_pan_pan = 0.0f;
	AIL_stream_volume_pan(stream, &volume_pan_volume, &volume_pan_pan);

	S32 stream_ms_length = 0;
	S32 stream_ms_position = 0;
	AIL_stream_ms_position(stream, &stream_ms_length, &stream_ms_position);
	const S32 stream_volume = AIL_stream_volume(stream);
	const S32 stream_pan = AIL_stream_pan(stream);
	const S32 stream_playback_rate = AIL_stream_playback_rate(stream);
	const S32 stream_loop_count = AIL_stream_loop_count(stream);

	AIL_start_stream(stream);
	const S32 status_after_start = AIL_stream_status(stream);

	AIL_pause_stream(stream, 1);
	const S32 status_after_pause = AIL_stream_status(stream);

	AIL_pause_stream(stream, 0);
	const S32 status_after_resume = AIL_stream_status(stream);

	HSAMPLE sample = AIL_allocate_sample_handle(digital);
	AIL_init_sample(sample);
	U8 fake_sample_data[8] = { 'R', 'I', 'F', 'F', 0, 0, 0, 0 };
	AIL_set_sample_file(sample, fake_sample_data, 0);
	HSTREAM by_sample_stream =
		AIL_open_stream_by_sample(digital, sample, "Data\\Audio\\Tracks\\ProbeBySample.wav", 0);
	const bool by_sample_stream_allocated = handle_valid(by_sample_stream);
	AIL_close_stream(by_sample_stream);
	const bool by_sample_stream_closed = MSSBrowserFindStream(by_sample_stream) == nullptr;

	const MSSBrowserStreamState *before_close = MSSBrowserFindStream(stream);
	const bool before_close_state =
		before_close != nullptr &&
		before_close->allocated &&
		!before_close->closed &&
		before_close->driver == digital &&
		before_close->filename != nullptr &&
		before_close->started &&
		before_close->resumed &&
		!before_close->paused &&
		before_close->status == SMP_PLAYING &&
		before_close->loop_start == 5 &&
		before_close->loop_end == 125;
	const S32 loop_start_before_close = before_close != nullptr ? before_close->loop_start : 0;
	const S32 loop_end_before_close = before_close != nullptr ? before_close->loop_end : 0;

	AIL_close_stream(stream);
	const bool stream_closed = MSSBrowserFindStream(stream) == nullptr;
	const S32 status_after_close = AIL_stream_status(stream);
	const S32 pan_after_close = AIL_stream_pan(stream);
	AIL_release_sample_handle(sample);

	const bool ok =
		quick_startup_result == 1 &&
		digital != nullptr &&
		stream_allocated &&
		previous_callback == nullptr &&
		stream_volume == 88 &&
		stream_pan == 48 &&
		volume_pan_volume > 0.749f &&
		volume_pan_volume < 0.751f &&
		volume_pan_pan > 0.374f &&
		volume_pan_pan < 0.376f &&
		stream_playback_rate == 32000 &&
		stream_loop_count == 2 &&
		stream_ms_position == 250 &&
		status_after_start == SMP_PLAYING &&
		status_after_pause == SMP_STOPPED &&
		status_after_resume == SMP_PLAYING &&
		by_sample_stream_allocated &&
		by_sample_stream_closed &&
		before_close_state &&
		stream_closed &&
		status_after_close == SMP_DONE &&
		pan_after_close == 0 &&
		g_stream_callback_count == 0 &&
		g_stream_callback_last_handle == 0;

	std::snprintf(g_mss_stream_lifecycle_probe_json, sizeof(g_mss_stream_lifecycle_probe_json),
		"{\"ok\":%s,"
		"\"source\":\"Mss.H browser stream lifecycle contract probe\","
		"\"runtimeReady\":false,"
		"\"streamLifecycleReady\":%s,"
		"\"playbackReady\":false,"
		"\"nextRequired\":\"webAudioPlaybackBackend\","
		"\"quickStartup\":{\"result\":%d,\"digitalHandle\":%s},"
		"\"calls\":{\"AIL_open_stream\":%s,"
		"\"AIL_open_stream_by_sample\":%s,"
		"\"AIL_register_stream_callback\":%s,"
		"\"AIL_set_stream_volume\":%d,"
		"\"AIL_set_stream_pan\":%d,"
		"\"AIL_set_stream_volume_pan\":{\"volume\":%.3f,\"pan\":%.3f},"
		"\"AIL_set_stream_playback_rate\":%d,"
		"\"AIL_set_stream_loop_block\":{\"start\":%d,\"end\":%d},"
		"\"AIL_set_stream_loop_count\":%d,"
		"\"AIL_set_stream_ms_position\":%d,"
		"\"AIL_start_stream\":%d,"
		"\"AIL_pause_stream_stop\":%d,"
		"\"AIL_pause_stream_resume\":%d,"
		"\"AIL_close_stream\":%s},"
		"\"callback\":{\"count\":%d,\"lastHandle\":%llu},"
		"\"handle\":{\"stream\":%llu,\"bySampleStream\":%llu,"
		"\"validBeforeClose\":%s,\"closed\":%s,\"bySampleClosed\":%s,"
		"\"statusAfterClose\":%d,\"panAfterClose\":%d}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		quick_startup_result,
		digital != nullptr ? "true" : "false",
		stream_allocated ? "true" : "false",
		by_sample_stream_allocated ? "true" : "false",
		previous_callback == nullptr ? "true" : "false",
		stream_volume,
		stream_pan,
		static_cast<double>(volume_pan_volume),
		static_cast<double>(volume_pan_pan),
		stream_playback_rate,
		loop_start_before_close,
		loop_end_before_close,
		stream_loop_count,
		stream_ms_position,
		status_after_start,
		status_after_pause,
		status_after_resume,
		stream_closed ? "true" : "false",
		g_stream_callback_count,
		static_cast<unsigned long long>(g_stream_callback_last_handle),
		static_cast<unsigned long long>(stream),
		static_cast<unsigned long long>(by_sample_stream),
		before_close_state ? "true" : "false",
		stream_closed ? "true" : "false",
		by_sample_stream_closed ? "true" : "false",
		status_after_close,
		pan_after_close);

	return g_mss_stream_lifecycle_probe_json;
}

}
