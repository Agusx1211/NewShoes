#pragma once

#include <cstdint>

#include "windows.h"

using S8 = std::int8_t;
using U8 = std::uint8_t;
using S16 = std::int16_t;
using U16 = std::uint16_t;
using S32 = std::int32_t;
using U32 = std::uint32_t;
using F32 = float;
using C8 = char;

struct AILDigitalDriver
{
	BOOL emulated_ds = FALSE;
	S32 output_rate = 0;
	S32 output_bits = 0;
	S32 output_channels = 0;
};

using HDIGDRIVER = AILDigitalDriver *;
using HPROVIDER = std::uintptr_t;
using HSAMPLE = std::uintptr_t;
using H3DSAMPLE = std::uintptr_t;
using H3DPOBJECT = std::uintptr_t;
using HSTREAM = std::uintptr_t;
using HTIMER = std::uintptr_t;
using HPROENUM = std::uint32_t;
using HAUDIO = std::uintptr_t;
using AILLPDIRECTSOUND = void *;

struct WAVEFORMAT
{
	WORD wFormatTag;
	WORD nChannels;
	DWORD nSamplesPerSec;
	DWORD nAvgBytesPerSec;
	WORD nBlockAlign;
};

using LPWAVEFORMAT = WAVEFORMAT *;

struct PCMWAVEFORMAT
{
	WAVEFORMAT wf;
	WORD wBitsPerSample;
};

struct AILSOUNDINFO
{
	S32 format;
	S32 rate;
	S32 bits;
	S32 channels;
};

#ifndef AILCALLBACK
#define AILCALLBACK
#endif

#ifndef DP_FILTER
#define DP_FILTER 0
#endif

#ifndef AIL_NO_ERROR
#define AIL_NO_ERROR 0
#endif

#ifndef M3D_NOERR
#define M3D_NOERR 0
#endif

#ifndef AIL_LOCK_PROTECTION
#define AIL_LOCK_PROTECTION 0
#endif

#ifndef DIG_USE_WAVEOUT
#define DIG_USE_WAVEOUT 1
#endif

#ifndef AIL_3D_2_SPEAKER
#define AIL_3D_2_SPEAKER 2
#endif

#ifndef AIL_3D_HEADPHONE
#define AIL_3D_HEADPHONE 1
#endif

#ifndef AIL_3D_4_SPEAKER
#define AIL_3D_4_SPEAKER 4
#endif

#ifndef AIL_3D_SURROUND
#define AIL_3D_SURROUND 5
#endif

#ifndef AIL_3D_51_SPEAKER
#define AIL_3D_51_SPEAKER 6
#endif

#ifndef AIL_3D_71_SPEAKER
#define AIL_3D_71_SPEAKER 7
#endif

#ifndef AIL_FILE_SEEK_BEGIN
#define AIL_FILE_SEEK_BEGIN 0
#endif

#ifndef AIL_FILE_SEEK_CURRENT
#define AIL_FILE_SEEK_CURRENT 1
#endif

#ifndef AIL_FILE_SEEK_END
#define AIL_FILE_SEEK_END 2
#endif

#ifndef WAVE_FORMAT_PCM
#define WAVE_FORMAT_PCM 1
#endif

#ifndef WAVE_FORMAT_IMA_ADPCM
#define WAVE_FORMAT_IMA_ADPCM 0x0011
#endif

#ifndef ENVIRONMENT_GENERIC
#define ENVIRONMENT_GENERIC 0
#endif

#ifndef HPROENUM_FIRST
#define HPROENUM_FIRST 0
#endif

#ifndef YES
#define YES 1
#endif

#ifndef NO
#define NO 0
#endif

using AIL_file_open_callback = U32 (AILCALLBACK *)(char const *, U32 *);
using AIL_file_close_callback = void (AILCALLBACK *)(U32);
using AIL_file_seek_callback = S32 (AILCALLBACK *)(U32, S32, U32);
using AIL_file_read_callback = U32 (AILCALLBACK *)(U32, void *, U32);

static inline std::uintptr_t MSSInvalidHandle()
{
	return static_cast<std::uintptr_t>(-1);
}

struct MSSBrowserRuntimeState
{
	bool redist_directory_set = false;
	bool startup_called = false;
	bool shutdown_called = false;
	bool quick_startup_called = false;
	bool quick_startup_ok = false;
	bool file_callbacks_set = false;
	S32 use_digital = 0;
	S32 use_midi = 0;
	S32 output_rate = 0;
	S32 output_bits = 0;
	S32 output_channels = 0;
	AILDigitalDriver digital_driver = {};
	std::uintptr_t next_sample_handle = 0x2000;
	std::uintptr_t next_3d_sample_handle = 0x3000;
	std::uintptr_t next_listener_handle = 0x4000;
	AIL_file_open_callback file_open = nullptr;
	AIL_file_close_callback file_close = nullptr;
	AIL_file_seek_callback file_seek = nullptr;
	AIL_file_read_callback file_read = nullptr;
};

static inline MSSBrowserRuntimeState &MSSBrowserRuntime()
{
	static MSSBrowserRuntimeState state;
	return state;
}

static inline void MSSBrowserRuntimeReset()
{
	MSSBrowserRuntime() = MSSBrowserRuntimeState {};
}

static inline bool MSSBrowserRuntimeStarted()
{
	const MSSBrowserRuntimeState &state = MSSBrowserRuntime();
	return state.startup_called && !state.shutdown_called;
}

static inline bool MSSBrowserHandleValid(std::uintptr_t handle)
{
	return handle != 0 && handle != MSSInvalidHandle();
}

static inline void AIL_startup()
{
	MSSBrowserRuntimeState &state = MSSBrowserRuntime();
	state.startup_called = true;
	state.shutdown_called = false;
}

static inline void AIL_shutdown()
{
	MSSBrowserRuntimeState &state = MSSBrowserRuntime();
	state.shutdown_called = true;
	state.quick_startup_ok = false;
}
static inline void AIL_lock() {}
static inline void AIL_unlock() {}
static inline void AIL_MSS_version(char *buffer, S32 bufferSize)
{
	if (buffer != nullptr && bufferSize > 0) {
		buffer[0] = '\0';
	}
}
static inline S32 AIL_get_timer_highest_delay() { return 0; }
static inline void AIL_set_redist_directory(const char *)
{
	MSSBrowserRuntime().redist_directory_set = true;
}
static inline S32 AIL_set_preference(U32, S32) { return AIL_NO_ERROR; }
static inline S32 AIL_waveOutOpen(HDIGDRIVER *driver, void *, U32, LPWAVEFORMAT)
{
	if (driver != nullptr) {
		*driver = nullptr;
	}
	return 1;
}
static inline void AIL_waveOutClose(HDIGDRIVER) {}
static inline char *AIL_last_error()
{
	static char error[] = "Miles runtime is not available in the wasm compile shim";
	return error;
}
static inline S32 AIL_WAV_info(U8 *, AILSOUNDINFO *) { return 0; }
static inline S32 AIL_WAV_info(char *data, AILSOUNDINFO *info)
{
	return AIL_WAV_info(reinterpret_cast<U8 *>(data), info);
}
static inline S32 AIL_decompress_ADPCM(AILSOUNDINFO *, void **decompressed, U32 *decompressedSize)
{
	if (decompressed != nullptr) {
		*decompressed = nullptr;
	}
	if (decompressedSize != nullptr) {
		*decompressedSize = 0;
	}
	return 0;
}
static inline void AIL_mem_free_lock(void *) {}
static inline HSAMPLE AIL_allocate_sample_handle(HDIGDRIVER driver)
{
	if (driver == nullptr || !MSSBrowserRuntimeStarted()) {
		return static_cast<HSAMPLE>(MSSInvalidHandle());
	}
	return static_cast<HSAMPLE>(MSSBrowserRuntime().next_sample_handle++);
}
static inline void AIL_release_sample_handle(HSAMPLE) {}
static inline void AIL_init_sample(HSAMPLE) {}
static inline void AIL_set_named_sample_file(HSAMPLE, char *, U8 *, U32, S32) {}
static inline S32 AIL_set_sample_file(HSAMPLE, void *, S32) { return 0; }
static inline void AIL_start_sample(HSAMPLE) {}
static inline void AIL_stop_sample(HSAMPLE) {}
static inline void AIL_resume_sample(HSAMPLE) {}
static inline void AIL_end_sample(HSAMPLE) {}
static inline void AIL_set_sample_pan(HSAMPLE, S32) {}
static inline S32 AIL_sample_pan(HSAMPLE) { return 0; }
static inline void AIL_set_sample_volume(HSAMPLE, S32) {}
static inline S32 AIL_sample_volume(HSAMPLE) { return 0; }
static inline void AIL_set_sample_loop_count(HSAMPLE, S32) {}
static inline S32 AIL_sample_loop_count(HSAMPLE) { return 0; }
static inline void AIL_set_sample_ms_position(HSAMPLE, S32) {}
static inline void AIL_sample_ms_position(HSAMPLE, S32 *len, S32 *pos)
{
	if (len != nullptr) {
		*len = 0;
	}
	if (pos != nullptr) {
		*pos = 0;
	}
}
static inline void AIL_set_sample_user_data(HSAMPLE, S32, S32) {}
static inline S32 AIL_sample_user_data(HSAMPLE, S32) { return 0; }
static inline void AIL_sample_volume_pan(HSAMPLE, F32 *volume, F32 *pan)
{
	if (volume != nullptr) {
		*volume = 0.0f;
	}
	if (pan != nullptr) {
		*pan = 0.5f;
	}
}
static inline void AIL_set_sample_volume_pan(HSAMPLE, F32, F32) {}
static inline S32 AIL_sample_playback_rate(HSAMPLE) { return 0; }
static inline void AIL_set_sample_playback_rate(HSAMPLE, S32) {}
static inline HPROVIDER AIL_set_sample_processor(HSAMPLE, U32, HPROVIDER) { return 0; }
static inline void AIL_set_filter_sample_preference(HSAMPLE, const char *, F32 *) {}
using AIL_sample_callback = void (AILCALLBACK *)(HSAMPLE);
static inline AIL_sample_callback AIL_register_EOS_callback(HSAMPLE, AIL_sample_callback callback)
{
	return callback;
}
static inline H3DSAMPLE AIL_allocate_3D_sample_handle(HPROVIDER provider)
{
	if (!MSSBrowserRuntimeStarted() || provider == 0) {
		return static_cast<H3DSAMPLE>(MSSInvalidHandle());
	}
	return static_cast<H3DSAMPLE>(MSSBrowserRuntime().next_3d_sample_handle++);
}
static inline void AIL_release_3D_sample_handle(H3DSAMPLE) {}
static inline U32 AIL_set_3D_sample_file(H3DSAMPLE, U8 *) { return 0; }
static inline U32 AIL_set_3D_sample_file(H3DSAMPLE sample, void *data)
{
	return AIL_set_3D_sample_file(sample, static_cast<U8 *>(data));
}
static inline void AIL_start_3D_sample(H3DSAMPLE) {}
static inline void AIL_stop_3D_sample(H3DSAMPLE) {}
static inline void AIL_resume_3D_sample(H3DSAMPLE) {}
static inline void AIL_end_3D_sample(H3DSAMPLE) {}
static inline void AIL_set_3D_sample_volume(H3DSAMPLE, S32) {}
static inline S32 AIL_3D_sample_volume(H3DSAMPLE) { return 0; }
static inline void AIL_set_3D_sample_loop_count(H3DSAMPLE, S32) {}
static inline S32 AIL_3D_sample_loop_count(H3DSAMPLE) { return 0; }
static inline void AIL_set_3D_sample_offset(H3DSAMPLE, U32) {}
static inline U32 AIL_3D_sample_offset(H3DSAMPLE) { return 0; }
static inline U32 AIL_3D_sample_length(H3DSAMPLE) { return 0; }
static inline void AIL_set_3D_object_user_data(H3DPOBJECT, S32, S32) {}
static inline S32 AIL_3D_object_user_data(H3DPOBJECT, S32) { return 0; }
static inline void AIL_set_3D_user_data(H3DSAMPLE sample, S32 index, S32 value)
{
	AIL_set_3D_object_user_data(sample, index, value);
}
static inline S32 AIL_3D_user_data(H3DSAMPLE sample, S32 index)
{
	return AIL_3D_object_user_data(sample, index);
}
static inline S32 AIL_3D_sample_playback_rate(H3DSAMPLE) { return 0; }
static inline void AIL_set_3D_sample_playback_rate(H3DSAMPLE, S32) {}
static inline void AIL_set_3D_sample_occlusion(H3DSAMPLE, F32) {}
static inline void AIL_set_3D_position(H3DPOBJECT, F32, F32, F32) {}
static inline void AIL_set_3D_orientation(H3DPOBJECT, F32, F32, F32, F32, F32, F32) {}
static inline void AIL_set_3D_velocity_vector(H3DPOBJECT, F32, F32, F32) {}
static inline void AIL_set_3D_sample_distances(H3DSAMPLE, F32, F32) {}
static inline void AIL_set_3D_sample_effects_level(H3DSAMPLE, F32) {}
using AIL_3D_sample_callback = void (AILCALLBACK *)(H3DSAMPLE);
static inline AIL_3D_sample_callback AIL_register_3D_EOS_callback(
	H3DSAMPLE,
	AIL_3D_sample_callback callback)
{
	return callback;
}
static inline H3DPOBJECT AIL_3D_open_listener(HPROVIDER provider)
{
	if (!MSSBrowserRuntimeStarted() || provider == 0) {
		return static_cast<H3DPOBJECT>(MSSInvalidHandle());
	}
	return static_cast<H3DPOBJECT>(MSSBrowserRuntime().next_listener_handle++);
}
static inline H3DPOBJECT AIL_open_3D_listener(HPROVIDER provider) { return AIL_3D_open_listener(provider); }
static inline void AIL_close_3D_listener(H3DPOBJECT) {}
static inline S32 AIL_enumerate_3D_providers(HPROENUM *next, HPROVIDER *provider, char **name)
{
	static char fast2DName[] = "Miles Fast 2D Positional Audio";
	static char dolbyName[] = "Dolby Surround";
	if (next == nullptr || provider == nullptr || name == nullptr || !MSSBrowserRuntimeStarted()) {
		return 0;
	}
	if (*next == HPROENUM_FIRST) {
		*provider = 1;
		*name = fast2DName;
		*next = 1;
		return 1;
	}
	if (*next == 1) {
		*provider = 2;
		*name = dolbyName;
		*next = 2;
		return 1;
	}
	return 0;
}
static inline S32 AIL_open_3D_provider(HPROVIDER provider)
{
	return MSSBrowserRuntimeStarted() && (provider == 1 || provider == 2) ? M3D_NOERR : 1;
}
static inline void AIL_close_3D_provider(HPROVIDER) {}
static inline void AIL_set_3D_speaker_type(HPROVIDER, S32) {}
static inline S32 AIL_enumerate_filters(HPROENUM *, HPROVIDER *, char **) { return 0; }
static inline HSTREAM AIL_open_stream_by_sample(HDIGDRIVER, HSAMPLE, const char *, S32)
{
	return static_cast<HSTREAM>(MSSInvalidHandle());
}
static inline HSTREAM AIL_open_stream(HDIGDRIVER, const char *, S32) { return static_cast<HSTREAM>(MSSInvalidHandle()); }
static inline void AIL_start_stream(HSTREAM) {}
static inline void AIL_pause_stream(HSTREAM, S32) {}
static inline void AIL_close_stream(HSTREAM) {}
static inline void AIL_set_stream_pan(HSTREAM, S32) {}
static inline S32 AIL_stream_pan(HSTREAM) { return 0; }
static inline void AIL_set_stream_volume(HSTREAM, S32) {}
static inline S32 AIL_stream_volume(HSTREAM) { return 0; }
static inline void AIL_set_stream_loop_block(HSTREAM, S32, S32) {}
static inline void AIL_set_stream_loop_count(HSTREAM, S32) {}
static inline S32 AIL_stream_loop_count(HSTREAM) { return 0; }
static inline void AIL_set_stream_ms_position(HSTREAM, S32) {}
static inline void AIL_stream_ms_position(HSTREAM, S32 *len, S32 *pos)
{
	if (len != nullptr) {
		*len = 0;
	}
	if (pos != nullptr) {
		*pos = 0;
	}
}
static inline void AIL_stream_ms_position(HSTREAM stream, long *len, long *pos)
{
	S32 len32 = 0;
	S32 pos32 = 0;
	AIL_stream_ms_position(stream, len != nullptr ? &len32 : nullptr, pos != nullptr ? &pos32 : nullptr);
	if (len != nullptr) {
		*len = static_cast<long>(len32);
	}
	if (pos != nullptr) {
		*pos = static_cast<long>(pos32);
	}
}
static inline S32 AIL_stream_playback_rate(HSTREAM) { return 0; }
static inline void AIL_set_stream_playback_rate(HSTREAM, S32) {}
static inline void AIL_stream_volume_pan(HSTREAM, F32 *volume, F32 *pan)
{
	if (volume != nullptr) {
		*volume = 0.0f;
	}
	if (pan != nullptr) {
		*pan = 0.5f;
	}
}
static inline void AIL_set_stream_volume_pan(HSTREAM, F32, F32) {}
using AIL_stream_callback = void (AILCALLBACK *)(HSTREAM);
static inline AIL_stream_callback AIL_register_stream_callback(HSTREAM, AIL_stream_callback callback)
{
	return callback;
}
static inline void AIL_set_file_callbacks(
	AIL_file_open_callback open,
	AIL_file_close_callback close,
	AIL_file_seek_callback seek,
	AIL_file_read_callback read)
{
	MSSBrowserRuntimeState &state = MSSBrowserRuntime();
	state.file_open = open;
	state.file_close = close;
	state.file_seek = seek;
	state.file_read = read;
	state.file_callbacks_set =
		open != nullptr && close != nullptr && seek != nullptr && read != nullptr;
}
static inline S32 AIL_quick_startup(
	S32 useDigital,
	S32 useMidi,
	S32 outputRate,
	S32 outputBits,
	S32 outputChannels)
{
	MSSBrowserRuntimeState &state = MSSBrowserRuntime();
	state.quick_startup_called = true;
	state.use_digital = useDigital;
	state.use_midi = useMidi;
	state.output_rate = outputRate;
	state.output_bits = outputBits;
	state.output_channels = outputChannels;
	state.quick_startup_ok =
		MSSBrowserRuntimeStarted() && useDigital != 0 && outputRate > 0 &&
		outputBits > 0 && outputChannels > 0;
	if (state.quick_startup_ok) {
		state.digital_driver.emulated_ds = TRUE;
		state.digital_driver.output_rate = outputRate;
		state.digital_driver.output_bits = outputBits;
		state.digital_driver.output_channels = outputChannels;
		return 1;
	}
	return 0;
}
static inline void AIL_quick_handles(HDIGDRIVER *digital, void *, void *)
{
	if (digital != nullptr) {
		MSSBrowserRuntimeState &state = MSSBrowserRuntime();
		*digital = state.quick_startup_ok ? &state.digital_driver : nullptr;
	}
}
static inline HAUDIO AIL_quick_load_and_play(const char *, S32, S32)
{
	return static_cast<HAUDIO>(MSSInvalidHandle());
}
static inline void AIL_quick_set_volume(HAUDIO, F32, F32) {}
static inline void AIL_quick_unload(HAUDIO) {}
static inline void AIL_get_DirectSound_info(HSAMPLE, void **directSound, void *)
{
	if (directSound != nullptr) {
		*directSound = nullptr;
	}
}
static inline void AIL_stop_timer(HTIMER) {}
static inline void AIL_release_timer_handle(HTIMER) {}
