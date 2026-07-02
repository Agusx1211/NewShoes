#include <cstdint>
#include <cstdio>
#include <cstdlib>
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
char g_mss_adpcm_sample_playback_start_json[4096] = {};
char g_mss_sample_playback_finish_json[4096] = {};
U8 *g_adpcm_payload_buffer = nullptr;
U32 g_adpcm_payload_capacity = 0;
void *g_adpcm_decoded_wave = nullptr;
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

// Staging buffer the harness copies a real IMA ADPCM WAV payload into before
// invoking cnc_port_probe_mss_adpcm_sample_playback_start.
EMSCRIPTEN_KEEPALIVE U8 *cnc_port_mss_adpcm_payload_buffer(U32 length)
{
	if (length > g_adpcm_payload_capacity) {
		std::free(g_adpcm_payload_buffer);
		g_adpcm_payload_buffer = static_cast<U8 *>(std::malloc(length));
		g_adpcm_payload_capacity = g_adpcm_payload_buffer != nullptr ? length : 0;
	}
	return g_adpcm_payload_buffer;
}

// Runs the real Miles decode boundary (AIL_WAV_info -> AIL_decompress_ADPCM)
// on the staged real IMA ADPCM WAV, then hands the decoded PCM WAV to the
// browser-backed sample path (AIL_set_sample_file -> AIL_start_sample) so Web
// Audio schedules the decoded buffer. Finish via
// cnc_port_probe_mss_sample_playback_finish.
EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_mss_adpcm_sample_playback_start(U32 length)
{
	MSSBrowserRuntimeReset();
	g_playback_sample_eos_count = 0;
	g_playback_sample_eos_last_handle = 0;
	g_playback_sample = 0;
	if (g_adpcm_decoded_wave != nullptr) {
		AIL_mem_free_lock(g_adpcm_decoded_wave);
		g_adpcm_decoded_wave = nullptr;
	}

	AILSOUNDINFO source_info = {};
	const bool payload_staged =
		g_adpcm_payload_buffer != nullptr && length > 0 && length <= g_adpcm_payload_capacity;
	const bool wav_parsed =
		payload_staged && AIL_WAV_info(g_adpcm_payload_buffer, &source_info) == 1;
	const bool is_adpcm = wav_parsed && source_info.format == WAVE_FORMAT_IMA_ADPCM;

	U32 decoded_bytes = 0;
	S32 decompress_result = 0;
	if (is_adpcm) {
		decompress_result = AIL_decompress_ADPCM(&source_info, &g_adpcm_decoded_wave, &decoded_bytes);
	}

	AILSOUNDINFO decoded_info = {};
	const bool decoded_parsed =
		decompress_result == 1 && g_adpcm_decoded_wave != nullptr &&
		AIL_WAV_info(static_cast<U8 *>(g_adpcm_decoded_wave), &decoded_info) == 1;
	const U32 expected_data_bytes =
		source_info.samples * static_cast<U32>(source_info.channels > 0 ? source_info.channels : 0) * 2u;
	const bool decoded_pcm =
		decoded_parsed && decoded_info.format == WAVE_FORMAT_PCM && decoded_info.bits == 16 &&
		decoded_info.channels == source_info.channels && decoded_info.rate == source_info.rate;
	const bool size_matches =
		decoded_pcm && decoded_info.data_len == expected_data_bytes &&
		decoded_bytes == 44u + expected_data_bytes;

	AIL_startup();
	const S32 quick_startup_result = AIL_quick_startup(
		1, 0, decoded_info.rate > 0 ? static_cast<S32>(decoded_info.rate) : 44100, 16, 2);

	HDIGDRIVER digital = nullptr;
	AIL_quick_handles(&digital, nullptr, nullptr);

	g_playback_sample = AIL_allocate_sample_handle(digital);
	const bool allocated = handle_valid(g_playback_sample);

	AIL_init_sample(g_playback_sample);
	const S32 set_file_result =
		size_matches ? AIL_set_sample_file(g_playback_sample, g_adpcm_decoded_wave, 0) : 0;
	AIL_register_EOS_callback(g_playback_sample, playback_sample_eos);
	AIL_set_sample_volume_pan(g_playback_sample, 0.5f, 0.5f);
	if (decoded_info.rate > 0) {
		AIL_set_sample_playback_rate(g_playback_sample, static_cast<S32>(decoded_info.rate));
	}
	AIL_set_sample_loop_count(g_playback_sample, 1);

	if (set_file_result == 1) {
		AIL_start_sample(g_playback_sample);
	}
	const S32 status_after_start = AIL_sample_status(g_playback_sample);
	const MSSBrowserSampleState *after_start = MSSBrowserFindSample(g_playback_sample);
	const bool browser_start_requested =
		after_start != nullptr && after_start->browser_playback_requested;
	const bool ok =
		payload_staged &&
		wav_parsed &&
		is_adpcm &&
		decompress_result == 1 &&
		decoded_pcm &&
		size_matches &&
		quick_startup_result == 1 &&
		digital != nullptr &&
		allocated &&
		set_file_result == 1 &&
		status_after_start == SMP_PLAYING &&
		browser_start_requested;

	std::snprintf(g_mss_adpcm_sample_playback_start_json, sizeof(g_mss_adpcm_sample_playback_start_json),
		"{\"ok\":%s,"
		"\"source\":\"Mss.H real IMA ADPCM decode + browser 2D sample Web Audio playback start probe\","
		"\"boundary\":\"AIL_WAV_info->AIL_decompress_ADPCM->AIL_set_sample_file->AIL_start_sample\","
		"\"payload\":{\"staged\":%s,\"bytes\":%u,\"wavParsed\":%s,"
		"\"format\":%d,\"codec\":\"IMA_ADPCM\",\"channels\":%d,\"rate\":%u,"
		"\"blockSize\":%u,\"dataBytes\":%u,\"frames\":%u},"
		"\"decoded\":{\"result\":%d,\"format\":%d,\"bits\":%d,\"channels\":%d,"
		"\"rate\":%u,\"frames\":%u,\"dataBytes\":%u,\"expectedDataBytes\":%u,"
		"\"waveBytes\":%u,\"sizeMatches\":%s},"
		"\"quickStartup\":{\"result\":%d,\"digitalHandle\":%s},"
		"\"sample\":{\"handle\":%llu,\"setFile\":%d,\"statusAfterStart\":%d,"
		"\"browserStartRequested\":%s}}",
		ok ? "true" : "false",
		payload_staged ? "true" : "false",
		length,
		wav_parsed ? "true" : "false",
		source_info.format,
		source_info.channels,
		source_info.rate,
		source_info.block_size,
		source_info.data_len,
		source_info.samples,
		decompress_result,
		decoded_info.format,
		decoded_info.bits,
		decoded_info.channels,
		decoded_info.rate,
		decoded_info.samples,
		decoded_info.data_len,
		expected_data_bytes,
		decoded_bytes,
		size_matches ? "true" : "false",
		quick_startup_result,
		digital != nullptr ? "true" : "false",
		static_cast<unsigned long long>(g_playback_sample),
		set_file_result,
		status_after_start,
		browser_start_requested ? "true" : "false");

	return g_mss_adpcm_sample_playback_start_json;
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
