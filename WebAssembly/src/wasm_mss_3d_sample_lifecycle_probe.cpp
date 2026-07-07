#include <cstdint>
#include <cstdio>

#include "Mss.H"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

namespace {
char g_mss_3d_sample_lifecycle_probe_json[4096] = {};
int g_3d_callback_count = 0;
H3DSAMPLE g_3d_callback_last_handle = 0;

void AILCALLBACK probe_3d_callback(H3DSAMPLE sample)
{
	++g_3d_callback_count;
	g_3d_callback_last_handle = sample;
}

bool handle_valid(std::uintptr_t handle)
{
	return MSSBrowserHandleValid(handle);
}
}

extern "C" {

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_mss_3d_sample_lifecycle()
{
	MSSBrowserRuntimeReset();
	g_3d_callback_count = 0;
	g_3d_callback_last_handle = 0;

	AIL_startup();
	const S32 quick_startup_result = AIL_quick_startup(1, 0, 44100, 16, 2);

	HPROENUM next = HPROENUM_FIRST;
	HPROVIDER provider = 0;
	char *provider_name = nullptr;
	const S32 enumerate_result = AIL_enumerate_3D_providers(&next, &provider, &provider_name);
	const S32 open_provider_result = AIL_open_3D_provider(provider);
	AIL_set_3D_speaker_type(provider, AIL_3D_4_SPEAKER);

	H3DPOBJECT listener = AIL_open_3D_listener(provider);
	const bool listener_allocated = handle_valid(listener);
	AIL_set_3D_orientation(listener, 0.0f, 1.0f, 0.0f, 0.0f, 0.0f, -1.0f);
	AIL_set_3D_position(listener, 10.0f, 20.0f, 30.0f);
	AIL_set_3D_velocity_vector(listener, 1.0f, 2.0f, 3.0f);

	H3DSAMPLE sample = AIL_allocate_3D_sample_handle(provider);
	const bool sample_allocated = handle_valid(sample);
	AIL_set_3D_user_data(sample, 0, 7);
	AIL_set_3D_object_user_data(sample, 3, 99);
	const S32 user_data_0 = AIL_3D_user_data(sample, 0);
	const S32 user_data_3 = AIL_3D_object_user_data(sample, 3);

	U8 fake_sample_data[8] = { 'R', 'I', 'F', 'F', 0, 0, 0, 0 };
	const U32 set_file_result = AIL_set_3D_sample_file(sample, fake_sample_data);
	const AIL_3D_sample_callback previous_callback =
		AIL_register_3D_EOS_callback(sample, probe_3d_callback);

	AIL_set_3D_sample_distances(sample, 12.0f, 345.0f);
	AIL_set_3D_position(sample, 100.0f, 200.0f, 300.0f);
	AIL_set_3D_velocity_vector(sample, 4.0f, 5.0f, 6.0f);
	AIL_set_3D_sample_volume(sample, 66);
	const S32 legacy_volume = AIL_3D_sample_volume(sample);
	AIL_set_3D_sample_volume(sample, 0.42f);
	AIL_set_3D_sample_loop_count(sample, 3);
	AIL_set_3D_sample_offset(sample, 17);
	AIL_set_3D_sample_playback_rate(sample, 22050);
	AIL_set_3D_sample_occlusion(sample, 0.25f);
	AIL_set_3D_sample_effects_level(sample, 0.5f);

	const S32 normalized_volume = AIL_3D_sample_volume(sample);
	const S32 loop_count = AIL_3D_sample_loop_count(sample);
	const U32 offset = AIL_3D_sample_offset(sample);
	const U32 length = AIL_3D_sample_length(sample);
	const S32 playback_rate = AIL_3D_sample_playback_rate(sample);

	AIL_start_3D_sample(sample);
	const S32 status_after_start = AIL_3D_sample_status(sample);
	AIL_stop_3D_sample(sample);
	const S32 status_after_stop = AIL_3D_sample_status(sample);
	AIL_resume_3D_sample(sample);
	const S32 status_after_resume = AIL_3D_sample_status(sample);
	AIL_end_3D_sample(sample);
	const S32 status_after_end = AIL_3D_sample_status(sample);
	const AIL_3D_sample_callback callback_after_end =
		AIL_register_3D_EOS_callback(sample, nullptr);

	const MSSBrowser3DSampleState *sample_before_release = MSSBrowserFind3DSample(sample);
	const MSSBrowser3DListenerState *listener_before_close = MSSBrowserFind3DListener(listener);
	const bool sample_state =
		sample_before_release != nullptr &&
		sample_before_release->allocated &&
		!sample_before_release->released &&
		sample_before_release->provider == provider &&
		sample_before_release->file_set &&
		sample_before_release->file_data == fake_sample_data &&
		sample_before_release->position.x == 100.0f &&
		sample_before_release->position.y == 200.0f &&
		sample_before_release->position.z == 300.0f &&
		sample_before_release->velocity.x == 4.0f &&
		sample_before_release->velocity.y == 5.0f &&
		sample_before_release->velocity.z == 6.0f &&
		sample_before_release->min_distance == 12.0f &&
		sample_before_release->max_distance == 345.0f &&
		sample_before_release->volume == normalized_volume &&
		sample_before_release->volume_float > 0.419f &&
		sample_before_release->volume_float < 0.421f &&
		sample_before_release->occlusion > 0.249f &&
		sample_before_release->occlusion < 0.251f &&
		sample_before_release->effects_level > 0.499f &&
		sample_before_release->effects_level < 0.501f;
	const bool listener_state =
		listener_before_close != nullptr &&
		listener_before_close->allocated &&
		!listener_before_close->closed &&
		listener_before_close->provider == provider &&
		listener_before_close->position.x == 10.0f &&
		listener_before_close->position.y == 20.0f &&
		listener_before_close->position.z == 30.0f &&
		listener_before_close->velocity.x == 1.0f &&
		listener_before_close->velocity.y == 2.0f &&
		listener_before_close->velocity.z == 3.0f &&
		listener_before_close->front.y == 1.0f &&
		listener_before_close->up.z == -1.0f;

	AIL_release_3D_sample_handle(sample);
	const bool sample_released = MSSBrowserFind3DSample(sample) == nullptr;
	const S32 status_after_release = AIL_3D_sample_status(sample);
	AIL_close_3D_listener(listener);
	const bool listener_closed = MSSBrowserFind3DListener(listener) == nullptr;
	AIL_close_3D_provider(provider);
	const bool provider_closed =
		MSSBrowserProviderValid(provider) && !MSSBrowserRuntime().provider_open[provider];

	const bool ok =
		quick_startup_result == 1 &&
		enumerate_result == 1 &&
		provider == 1 &&
		provider_name != nullptr &&
		open_provider_result == M3D_NOERR &&
		MSSBrowserRuntime().provider_speaker_type[provider] == AIL_3D_4_SPEAKER &&
		listener_allocated &&
		sample_allocated &&
		user_data_0 == 7 &&
		user_data_3 == 99 &&
		set_file_result == 1 &&
		previous_callback == nullptr &&
		legacy_volume == 66 &&
		normalized_volume == 53 &&
		loop_count == 3 &&
		offset == 17 &&
		length == 0 &&
		playback_rate == 22050 &&
		status_after_start == SMP_PLAYING &&
		status_after_stop == SMP_STOPPED &&
		status_after_resume == SMP_PLAYING &&
		status_after_end == SMP_DONE &&
		callback_after_end == probe_3d_callback &&
		g_3d_callback_count == 1 &&
		g_3d_callback_last_handle == sample &&
		sample_state &&
		listener_state &&
		sample_released &&
		status_after_release == SMP_DONE &&
		listener_closed &&
		provider_closed;

	std::snprintf(g_mss_3d_sample_lifecycle_probe_json, sizeof(g_mss_3d_sample_lifecycle_probe_json),
		"{\"ok\":%s,"
		"\"source\":\"Mss.H browser 3D sample lifecycle contract probe\","
		"\"runtimeReady\":false,"
		"\"sample3DLifecycleReady\":%s,"
		"\"playbackReady\":false,"
		"\"nextRequired\":\"webAudioPlaybackBackend\","
		"\"provider\":{\"enumerated\":%s,\"id\":%llu,\"opened\":%s,\"speakerType\":%d,\"closed\":%s},"
		"\"listener\":{\"handle\":%llu,\"opened\":%s,\"position\":{\"x\":10,\"y\":20,\"z\":30},"
		"\"orientation\":{\"frontY\":1,\"upZ\":-1},\"closed\":%s},"
		"\"calls\":{\"AIL_allocate_3D_sample_handle\":%s,"
		"\"AIL_set_3D_user_data\":%d,"
		"\"AIL_set_3D_object_user_data\":%d,"
		"\"AIL_set_3D_sample_file\":%u,"
		"\"AIL_register_3D_EOS_callback\":%s,"
		"\"AIL_set_3D_sample_distances\":{\"min\":%.3f,\"max\":%.3f},"
		"\"AIL_set_3D_position\":{\"x\":%.3f,\"y\":%.3f,\"z\":%.3f},"
		"\"AIL_set_3D_sample_volume\":%d,"
		"\"AIL_set_3D_sample_volume_float\":%.3f,"
		"\"AIL_set_3D_sample_loop_count\":%d,"
		"\"AIL_set_3D_sample_offset\":%u,"
		"\"AIL_set_3D_sample_playback_rate\":%d,"
		"\"AIL_set_3D_sample_occlusion\":%.3f,"
		"\"AIL_set_3D_sample_effects_level\":%.3f,"
		"\"AIL_start_3D_sample\":%d,"
		"\"AIL_stop_3D_sample\":%d,"
		"\"AIL_resume_3D_sample\":%d,"
		"\"AIL_end_3D_sample\":%d,"
		"\"AIL_release_3D_sample_handle\":%s},"
		"\"callback\":{\"count\":%d,\"lastHandle\":%llu},"
		"\"handle\":{\"sample\":%llu,\"validBeforeRelease\":%s,"
		"\"released\":%s,\"statusAfterRelease\":%d}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		enumerate_result == 1 ? "true" : "false",
		static_cast<unsigned long long>(provider),
		open_provider_result == M3D_NOERR ? "true" : "false",
		MSSBrowserProviderValid(provider) ? MSSBrowserRuntime().provider_speaker_type[provider] : 0,
		provider_closed ? "true" : "false",
		static_cast<unsigned long long>(listener),
		listener_allocated ? "true" : "false",
		listener_closed ? "true" : "false",
		sample_allocated ? "true" : "false",
		user_data_0,
		user_data_3,
		set_file_result,
		previous_callback == nullptr ? "true" : "false",
		sample_before_release != nullptr ? static_cast<double>(sample_before_release->min_distance) : 0.0,
		sample_before_release != nullptr ? static_cast<double>(sample_before_release->max_distance) : 0.0,
		sample_before_release != nullptr ? static_cast<double>(sample_before_release->position.x) : 0.0,
		sample_before_release != nullptr ? static_cast<double>(sample_before_release->position.y) : 0.0,
		sample_before_release != nullptr ? static_cast<double>(sample_before_release->position.z) : 0.0,
		legacy_volume,
		sample_before_release != nullptr ? static_cast<double>(sample_before_release->volume_float) : 0.0,
		loop_count,
		offset,
		playback_rate,
		sample_before_release != nullptr ? static_cast<double>(sample_before_release->occlusion) : 0.0,
		sample_before_release != nullptr ? static_cast<double>(sample_before_release->effects_level) : 0.0,
		status_after_start,
		status_after_stop,
		status_after_resume,
		status_after_end,
		sample_released ? "true" : "false",
		g_3d_callback_count,
		static_cast<unsigned long long>(g_3d_callback_last_handle),
		static_cast<unsigned long long>(sample),
		sample_state ? "true" : "false",
		sample_released ? "true" : "false",
		status_after_release);

	return g_mss_3d_sample_lifecycle_probe_json;
}

}
