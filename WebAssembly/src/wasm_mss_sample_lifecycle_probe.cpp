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
char g_mss_sample_lifecycle_probe_json[4096] = {};
char g_mss_sample_playback_start_json[4096] = {};
char g_mss_sample_playback_finish_json[4096] = {};
int g_sample_eos_count = 0;
HSAMPLE g_sample_eos_last_handle = 0;
int g_playback_sample_eos_count = 0;
HSAMPLE g_playback_sample_eos_last_handle = 0;
HSAMPLE g_playback_sample = 0;

constexpr U32 kPlaybackSampleRate = 44100;
constexpr U32 kPlaybackChannels = 2;
constexpr U32 kPlaybackBitsPerSample = 16;
constexpr U32 kPlaybackFrames = 2205;
constexpr U32 kPlaybackDataBytes =
	kPlaybackFrames * kPlaybackChannels * (kPlaybackBitsPerSample / 8);
constexpr U32 kPlaybackWaveBytes = 44 + kPlaybackDataBytes;
U8 g_playback_wave[kPlaybackWaveBytes] = {};
bool g_playback_wave_ready = false;

void AILCALLBACK probe_sample_eos(HSAMPLE sample)
{
	++g_sample_eos_count;
	g_sample_eos_last_handle = sample;
}

void AILCALLBACK playback_sample_eos(HSAMPLE sample)
{
	++g_playback_sample_eos_count;
	g_playback_sample_eos_last_handle = sample;
}

bool handle_valid(std::uintptr_t handle)
{
	return MSSBrowserHandleValid(handle);
}

void write_u16_le(U8 *data, U32 offset, U16 value)
{
	data[offset] = static_cast<U8>(value & 0xff);
	data[offset + 1] = static_cast<U8>((value >> 8) & 0xff);
}

void write_u32_le(U8 *data, U32 offset, U32 value)
{
	data[offset] = static_cast<U8>(value & 0xff);
	data[offset + 1] = static_cast<U8>((value >> 8) & 0xff);
	data[offset + 2] = static_cast<U8>((value >> 16) & 0xff);
	data[offset + 3] = static_cast<U8>((value >> 24) & 0xff);
}

void prepare_playback_wave()
{
	if (g_playback_wave_ready) {
		return;
	}

	std::memcpy(g_playback_wave + 0, "RIFF", 4);
	write_u32_le(g_playback_wave, 4, 36 + kPlaybackDataBytes);
	std::memcpy(g_playback_wave + 8, "WAVE", 4);
	std::memcpy(g_playback_wave + 12, "fmt ", 4);
	write_u32_le(g_playback_wave, 16, 16);
	write_u16_le(g_playback_wave, 20, WAVE_FORMAT_PCM);
	write_u16_le(g_playback_wave, 22, kPlaybackChannels);
	write_u32_le(g_playback_wave, 24, kPlaybackSampleRate);
	write_u32_le(g_playback_wave, 28, kPlaybackSampleRate * kPlaybackChannels * (kPlaybackBitsPerSample / 8));
	write_u16_le(g_playback_wave, 32, kPlaybackChannels * (kPlaybackBitsPerSample / 8));
	write_u16_le(g_playback_wave, 34, kPlaybackBitsPerSample);
	std::memcpy(g_playback_wave + 36, "data", 4);
	write_u32_le(g_playback_wave, 40, kPlaybackDataBytes);

	U32 cursor = 44;
	for (U32 frame = 0; frame < kPlaybackFrames; ++frame) {
		const S16 sample = (frame % 80) < 40 ? 12000 : -12000;
		for (U32 channel = 0; channel < kPlaybackChannels; ++channel) {
			write_u16_le(g_playback_wave, cursor, static_cast<U16>(sample));
			cursor += 2;
		}
	}

	g_playback_wave_ready = true;
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

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_mss_sample_playback_start()
{
	prepare_playback_wave();
	MSSBrowserRuntimeReset();
	g_playback_sample_eos_count = 0;
	g_playback_sample_eos_last_handle = 0;
	g_playback_sample = 0;

	AIL_startup();
	const S32 quick_startup_result = AIL_quick_startup(1, 0, kPlaybackSampleRate, 16, kPlaybackChannels);

	HDIGDRIVER digital = nullptr;
	AIL_quick_handles(&digital, nullptr, nullptr);

	g_playback_sample = AIL_allocate_sample_handle(digital);
	const bool allocated = handle_valid(g_playback_sample);

	AIL_init_sample(g_playback_sample);
	const S32 set_file_result = AIL_set_sample_file(g_playback_sample, g_playback_wave, 0);
	AIL_register_EOS_callback(g_playback_sample, playback_sample_eos);
	AIL_set_sample_volume_pan(g_playback_sample, 0.5f, 0.75f);
	AIL_set_sample_playback_rate(g_playback_sample, kPlaybackSampleRate);
	AIL_set_sample_loop_count(g_playback_sample, 1);

	AIL_start_sample(g_playback_sample);
	const S32 status_after_start = AIL_sample_status(g_playback_sample);
	const MSSBrowserSampleState *after_start = MSSBrowserFindSample(g_playback_sample);
	const bool browser_start_requested =
		after_start != nullptr && after_start->browser_playback_requested;
	const bool ok =
		quick_startup_result == 1 &&
		digital != nullptr &&
		allocated &&
		set_file_result == 1 &&
		status_after_start == SMP_PLAYING &&
		browser_start_requested;

	std::snprintf(g_mss_sample_playback_start_json, sizeof(g_mss_sample_playback_start_json),
		"{\"ok\":%s,"
		"\"source\":\"Mss.H browser 2D sample Web Audio playback start probe\","
		"\"runtimeReady\":false,"
		"\"sampleLifecycleReady\":true,"
		"\"playbackReady\":%s,"
		"\"nextRequired\":\"realMilesAudioManagerSamplePlayback\","
		"\"quickStartup\":{\"result\":%d,\"digitalHandle\":%s,"
		"\"outputRate\":%u,\"outputBits\":16,\"outputChannels\":%u},"
		"\"sample\":{\"handle\":%llu,\"statusAfterStart\":%d,"
		"\"browserStartRequested\":%s,\"volume\":%.3f,\"pan\":%.3f,"
		"\"playbackRate\":%u,\"loopCount\":1},"
		"\"payload\":{\"container\":\"RIFF/WAVE\",\"codec\":\"PCM\","
		"\"bytes\":%u,\"dataBytes\":%u,\"frames\":%u,"
		"\"sampleRate\":%u,\"channels\":%u,\"bitsPerSample\":%u}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		quick_startup_result,
		digital != nullptr ? "true" : "false",
		kPlaybackSampleRate,
		kPlaybackChannels,
		static_cast<unsigned long long>(g_playback_sample),
		status_after_start,
		browser_start_requested ? "true" : "false",
		0.5,
		0.75,
		kPlaybackSampleRate,
		kPlaybackWaveBytes,
		kPlaybackDataBytes,
		kPlaybackFrames,
		kPlaybackSampleRate,
		kPlaybackChannels,
		kPlaybackBitsPerSample);

	return g_mss_sample_playback_start_json;
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_mss_sample_playback_finish()
{
	const S32 status_before_end = AIL_sample_status(g_playback_sample);
	AIL_end_sample(g_playback_sample);
	const S32 status_after_end = AIL_sample_status(g_playback_sample);
	MSSBrowserSampleState *before_release = MSSBrowserFindSample(g_playback_sample);
	const bool browser_end_requested =
		before_release != nullptr && before_release->browser_playback_ended;
	AIL_release_sample_handle(g_playback_sample);
	const bool browser_release_requested =
		before_release != nullptr && before_release->browser_playback_released;
	const bool released = MSSBrowserFindSample(g_playback_sample) == nullptr;
	const S32 status_after_release = AIL_sample_status(g_playback_sample);
	const bool ok =
		handle_valid(g_playback_sample) &&
		status_before_end == SMP_PLAYING &&
		status_after_end == SMP_DONE &&
		g_playback_sample_eos_count == 1 &&
		g_playback_sample_eos_last_handle == g_playback_sample &&
		browser_end_requested &&
		browser_release_requested &&
		released &&
		status_after_release == SMP_DONE;

	std::snprintf(g_mss_sample_playback_finish_json, sizeof(g_mss_sample_playback_finish_json),
		"{\"ok\":%s,"
		"\"source\":\"Mss.H browser 2D sample Web Audio playback finish probe\","
		"\"playbackReady\":%s,"
		"\"nextRequired\":\"realMilesAudioManagerSamplePlayback\","
		"\"sample\":{\"handle\":%llu,\"statusBeforeEnd\":%d,"
		"\"statusAfterEnd\":%d,\"statusAfterRelease\":%d,"
		"\"browserEndRequested\":%s,\"browserReleaseRequested\":%s,"
		"\"released\":%s},"
		"\"callback\":{\"count\":%d,\"lastHandle\":%llu}}",
		ok ? "true" : "false",
		ok ? "true" : "false",
		static_cast<unsigned long long>(g_playback_sample),
		status_before_end,
		status_after_end,
		status_after_release,
		browser_end_requested ? "true" : "false",
		browser_release_requested ? "true" : "false",
		released ? "true" : "false",
		g_playback_sample_eos_count,
		static_cast<unsigned long long>(g_playback_sample_eos_last_handle));

	g_playback_sample = 0;
	return g_mss_sample_playback_finish_json;
}

}
