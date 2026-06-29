#include <cstdint>
#include <cstdio>

#include "Mss.H"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

namespace {
char g_mss_sample_lifecycle_probe_json[4096] = {};
int g_sample_eos_count = 0;
HSAMPLE g_sample_eos_last_handle = 0;

void AILCALLBACK probe_sample_eos(HSAMPLE sample)
{
	++g_sample_eos_count;
	g_sample_eos_last_handle = sample;
}

bool handle_valid(std::uintptr_t handle)
{
	return MSSBrowserHandleValid(handle);
}
}

extern "C" {

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_mss_sample_lifecycle()
{
	MSSBrowserRuntimeReset();
	g_sample_eos_count = 0;
	g_sample_eos_last_handle = 0;

	AIL_startup();
	const S32 quick_startup_result = AIL_quick_startup(1, 0, 44100, 16, 2);

	HDIGDRIVER digital = nullptr;
	AIL_quick_handles(&digital, nullptr, nullptr);

	HSAMPLE sample = AIL_allocate_sample_handle(digital);
	const bool allocated = handle_valid(sample);

	AIL_init_sample(sample);
	AIL_set_sample_user_data(sample, 0, 77);

	U8 fake_sample_data[8] = { 'R', 'I', 'F', 'F', 0, 0, 0, 0 };
	const S32 set_file_result = AIL_set_sample_file(sample, fake_sample_data, 0);
	const AIL_sample_callback previous_callback = AIL_register_EOS_callback(sample, probe_sample_eos);

	AIL_set_sample_volume(sample, 96);
	AIL_set_sample_pan(sample, 32);
	AIL_set_sample_volume_pan(sample, 0.625f, 0.25f);
	AIL_set_sample_playback_rate(sample, 22050);
	AIL_set_sample_loop_count(sample, 3);
	AIL_set_sample_ms_position(sample, 125);

	F32 volume_pan_volume = 0.0f;
	F32 volume_pan_pan = 0.0f;
	AIL_sample_volume_pan(sample, &volume_pan_volume, &volume_pan_pan);

	S32 sample_ms_length = 0;
	S32 sample_ms_position = 0;
	AIL_sample_ms_position(sample, &sample_ms_length, &sample_ms_position);
	const S32 user_data_value = AIL_sample_user_data(sample, 0);
	const S32 sample_volume = AIL_sample_volume(sample);
	const S32 sample_pan = AIL_sample_pan(sample);
	const S32 sample_playback_rate = AIL_sample_playback_rate(sample);
	const S32 sample_loop_count = AIL_sample_loop_count(sample);

	AIL_start_sample(sample);
	const S32 status_after_start = AIL_sample_status(sample);

	AIL_stop_sample(sample);
	const S32 status_after_stop = AIL_sample_status(sample);

	AIL_resume_sample(sample);
	const S32 status_after_resume = AIL_sample_status(sample);

	AIL_end_sample(sample);
	const S32 status_after_end = AIL_sample_status(sample);

	const MSSBrowserSampleState *before_release = MSSBrowserFindSample(sample);
	const bool before_release_state =
		before_release != nullptr &&
		before_release->allocated &&
		!before_release->released &&
		before_release->initialized &&
		before_release->file_set &&
		before_release->started &&
		before_release->resumed &&
		before_release->status == SMP_DONE;

	AIL_release_sample_handle(sample);
	const bool released = MSSBrowserFindSample(sample) == nullptr;
	const S32 status_after_release = AIL_sample_status(sample);
	const S32 user_data_after_release = AIL_sample_user_data(sample, 0);

	const bool ok =
		quick_startup_result == 1 &&
		digital != nullptr &&
		allocated &&
		set_file_result == 1 &&
		previous_callback == nullptr &&
		user_data_value == 77 &&
		sample_volume == 96 &&
		sample_pan == 32 &&
		volume_pan_volume > 0.624f &&
		volume_pan_volume < 0.626f &&
		volume_pan_pan > 0.249f &&
		volume_pan_pan < 0.251f &&
		sample_playback_rate == 22050 &&
		sample_loop_count == 3 &&
		sample_ms_position == 125 &&
		status_after_start == SMP_PLAYING &&
		status_after_stop == SMP_STOPPED &&
		status_after_resume == SMP_PLAYING &&
		status_after_end == SMP_DONE &&
		g_sample_eos_count == 1 &&
		g_sample_eos_last_handle == sample &&
		before_release_state &&
		released &&
		status_after_release == SMP_DONE &&
		user_data_after_release == 0;

	std::snprintf(g_mss_sample_lifecycle_probe_json, sizeof(g_mss_sample_lifecycle_probe_json),
		"{\"ok\":%s,"
		"\"source\":\"Mss.H browser 2D sample lifecycle contract probe\","
		"\"runtimeReady\":false,"
		"\"sampleLifecycleReady\":%s,"
		"\"playbackReady\":false,"
		"\"nextRequired\":\"webAudioPlaybackBackend\","
		"\"quickStartup\":{\"result\":%d,\"digitalHandle\":%s},"
		"\"calls\":{\"AIL_allocate_sample_handle\":%s,"
		"\"AIL_init_sample\":%s,"
		"\"AIL_set_sample_user_data\":%s,"
		"\"AIL_sample_user_data\":%d,"
		"\"AIL_set_sample_file\":%s,"
		"\"AIL_register_EOS_callback\":%s,"
		"\"AIL_set_sample_volume\":%d,"
		"\"AIL_set_sample_pan\":%d,"
		"\"AIL_set_sample_volume_pan\":{\"volume\":%.3f,\"pan\":%.3f},"
		"\"AIL_set_sample_playback_rate\":%d,"
		"\"AIL_set_sample_loop_count\":%d,"
		"\"AIL_set_sample_ms_position\":%d,"
		"\"AIL_start_sample\":%d,"
		"\"AIL_stop_sample\":%d,"
		"\"AIL_resume_sample\":%d,"
		"\"AIL_end_sample\":%d,"
		"\"AIL_release_sample_handle\":%s},"
		"\"callback\":{\"count\":%d,\"lastHandle\":%llu},"
		"\"handle\":{\"sample2D\":%llu,\"validBeforeRelease\":%s,"
		"\"released\":%s,\"statusAfterRelease\":%d,"
		"\"userDataAfterRelease\":%d}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		quick_startup_result,
		digital != nullptr ? "true" : "false",
		allocated ? "true" : "false",
		before_release != nullptr && before_release->initialized ? "true" : "false",
		user_data_value == 77 ? "true" : "false",
		user_data_value,
		set_file_result == 1 ? "true" : "false",
		previous_callback == nullptr ? "true" : "false",
		sample_volume,
		sample_pan,
		static_cast<double>(volume_pan_volume),
		static_cast<double>(volume_pan_pan),
		sample_playback_rate,
		sample_loop_count,
		sample_ms_position,
		status_after_start,
		status_after_stop,
		status_after_resume,
		status_after_end,
		released ? "true" : "false",
		g_sample_eos_count,
		static_cast<unsigned long long>(g_sample_eos_last_handle),
		static_cast<unsigned long long>(sample),
		before_release_state ? "true" : "false",
		released ? "true" : "false",
		status_after_release,
		user_data_after_release);

	return g_mss_sample_lifecycle_probe_json;
}

}
