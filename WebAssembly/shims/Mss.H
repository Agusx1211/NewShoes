#pragma once

#include <cstddef>
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
using AIL_sample_callback = void (AILCALLBACK *)(HSAMPLE);
using AIL_stream_callback = void (AILCALLBACK *)(HSTREAM);
using AIL_3D_sample_callback = void (AILCALLBACK *)(H3DSAMPLE);

#ifndef SMP_DONE
#define SMP_DONE 1
#endif

#ifndef SMP_PLAYING
#define SMP_PLAYING 2
#endif

#ifndef SMP_STOPPED
#define SMP_STOPPED 4
#endif

#ifndef MSS_BROWSER_MAX_SAMPLES
#define MSS_BROWSER_MAX_SAMPLES 64
#endif

#ifndef MSS_BROWSER_MAX_STREAMS
#define MSS_BROWSER_MAX_STREAMS 16
#endif

#ifndef MSS_BROWSER_MAX_3D_SAMPLES
#define MSS_BROWSER_MAX_3D_SAMPLES 64
#endif

#ifndef MSS_BROWSER_MAX_3D_LISTENERS
#define MSS_BROWSER_MAX_3D_LISTENERS 4
#endif

#ifndef MSS_BROWSER_MAX_3D_PROVIDERS
#define MSS_BROWSER_MAX_3D_PROVIDERS 4
#endif

static inline std::uintptr_t MSSInvalidHandle()
{
	return static_cast<std::uintptr_t>(-1);
}

struct MSSBrowserSampleState
{
	bool allocated = false;
	bool released = false;
	bool initialized = false;
	bool file_set = false;
	bool started = false;
	bool stopped = false;
	bool resumed = false;
	HSAMPLE handle = 0;
	void *file_data = nullptr;
	S32 file_flags = 0;
	S32 status = SMP_DONE;
	S32 user_data[8] = {};
	S32 volume = 127;
	S32 pan = 64;
	F32 volume_float = 1.0f;
	F32 pan_float = 0.5f;
	S32 playback_rate = 44100;
	S32 loop_count = 1;
	S32 ms_length = 0;
	S32 ms_position = 0;
	AIL_sample_callback eos_callback = nullptr;
};

struct MSSBrowserStreamState
{
	bool allocated = false;
	bool closed = false;
	bool open_by_sample = false;
	bool started = false;
	bool paused = false;
	bool resumed = false;
	HSTREAM handle = 0;
	HDIGDRIVER driver = nullptr;
	HSAMPLE sample = 0;
	const char *filename = nullptr;
	S32 flags = 0;
	S32 status = SMP_DONE;
	S32 volume = 127;
	S32 pan = 64;
	F32 volume_float = 1.0f;
	F32 pan_float = 0.5f;
	S32 playback_rate = 44100;
	S32 loop_start = 0;
	S32 loop_end = -1;
	S32 loop_count = 1;
	S32 ms_length = 0;
	S32 ms_position = 0;
	AIL_stream_callback eos_callback = nullptr;
};

struct MSSBrowser3DVector
{
	F32 x = 0.0f;
	F32 y = 0.0f;
	F32 z = 0.0f;
};

struct MSSBrowser3DSampleState
{
	bool allocated = false;
	bool released = false;
	bool file_set = false;
	bool started = false;
	bool stopped = false;
	bool resumed = false;
	bool ended = false;
	H3DSAMPLE handle = 0;
	HPROVIDER provider = 0;
	void *file_data = nullptr;
	S32 status = SMP_DONE;
	S32 user_data[8] = {};
	S32 volume = 127;
	S32 loop_count = 1;
	U32 offset = 0;
	U32 length = 0;
	S32 playback_rate = 44100;
	F32 occlusion = 0.0f;
	F32 min_distance = 0.0f;
	F32 max_distance = 0.0f;
	F32 effects_level = 0.0f;
	MSSBrowser3DVector position = {};
	MSSBrowser3DVector velocity = {};
	AIL_3D_sample_callback eos_callback = nullptr;
};

struct MSSBrowser3DListenerState
{
	bool allocated = false;
	bool closed = false;
	H3DPOBJECT handle = 0;
	HPROVIDER provider = 0;
	S32 user_data[8] = {};
	MSSBrowser3DVector position = {};
	MSSBrowser3DVector velocity = {};
	MSSBrowser3DVector front = {};
	MSSBrowser3DVector up = {};
};

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
	std::uintptr_t next_stream_handle = 0x5000;
	bool provider_open[MSS_BROWSER_MAX_3D_PROVIDERS] = {};
	S32 provider_speaker_type[MSS_BROWSER_MAX_3D_PROVIDERS] = {};
	MSSBrowserSampleState samples[MSS_BROWSER_MAX_SAMPLES] = {};
	MSSBrowserStreamState streams[MSS_BROWSER_MAX_STREAMS] = {};
	MSSBrowser3DSampleState samples3D[MSS_BROWSER_MAX_3D_SAMPLES] = {};
	MSSBrowser3DListenerState listeners3D[MSS_BROWSER_MAX_3D_LISTENERS] = {};
	AIL_file_open_callback file_open = nullptr;
	AIL_file_close_callback file_close = nullptr;
	AIL_file_seek_callback file_seek = nullptr;
	AIL_file_read_callback file_read = nullptr;
};

inline MSSBrowserRuntimeState g_MSSBrowserRuntimeState;

static inline MSSBrowserRuntimeState &MSSBrowserRuntime()
{
	return g_MSSBrowserRuntimeState;
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

static inline MSSBrowserSampleState *MSSBrowserFindSample(HSAMPLE handle)
{
	if (!MSSBrowserHandleValid(handle)) {
		return nullptr;
	}
	MSSBrowserRuntimeState &state = MSSBrowserRuntime();
	for (std::size_t i = 0; i < MSS_BROWSER_MAX_SAMPLES; ++i) {
		MSSBrowserSampleState &sample = state.samples[i];
		if (sample.allocated && !sample.released && sample.handle == handle) {
			return &sample;
		}
	}
	return nullptr;
}

static inline MSSBrowserStreamState *MSSBrowserFindStream(HSTREAM handle)
{
	if (!MSSBrowserHandleValid(handle)) {
		return nullptr;
	}
	MSSBrowserRuntimeState &state = MSSBrowserRuntime();
	for (std::size_t i = 0; i < MSS_BROWSER_MAX_STREAMS; ++i) {
		MSSBrowserStreamState &stream = state.streams[i];
		if (stream.allocated && !stream.closed && stream.handle == handle) {
			return &stream;
		}
	}
	return nullptr;
}

static inline MSSBrowserStreamState *MSSBrowserAllocateStream(HSTREAM handle)
{
	MSSBrowserRuntimeState &state = MSSBrowserRuntime();
	for (std::size_t i = 0; i < MSS_BROWSER_MAX_STREAMS; ++i) {
		MSSBrowserStreamState &stream = state.streams[i];
		if (!stream.allocated || stream.closed) {
			stream = MSSBrowserStreamState {};
			stream.allocated = true;
			stream.handle = handle;
			stream.playback_rate =
				state.digital_driver.output_rate > 0 ? state.digital_driver.output_rate : 44100;
			return &stream;
		}
	}
	return nullptr;
}

static inline bool MSSBrowserProviderValid(HPROVIDER provider)
{
	return provider > 0 && provider < MSS_BROWSER_MAX_3D_PROVIDERS;
}

static inline MSSBrowser3DSampleState *MSSBrowserFind3DSample(H3DSAMPLE handle)
{
	if (!MSSBrowserHandleValid(handle)) {
		return nullptr;
	}
	MSSBrowserRuntimeState &state = MSSBrowserRuntime();
	for (std::size_t i = 0; i < MSS_BROWSER_MAX_3D_SAMPLES; ++i) {
		MSSBrowser3DSampleState &sample = state.samples3D[i];
		if (sample.allocated && !sample.released && sample.handle == handle) {
			return &sample;
		}
	}
	return nullptr;
}

static inline MSSBrowser3DSampleState *MSSBrowserAllocate3DSample(H3DSAMPLE handle, HPROVIDER provider)
{
	MSSBrowserRuntimeState &state = MSSBrowserRuntime();
	for (std::size_t i = 0; i < MSS_BROWSER_MAX_3D_SAMPLES; ++i) {
		MSSBrowser3DSampleState &sample = state.samples3D[i];
		if (!sample.allocated || sample.released) {
			sample = MSSBrowser3DSampleState {};
			sample.allocated = true;
			sample.handle = handle;
			sample.provider = provider;
			sample.playback_rate =
				state.digital_driver.output_rate > 0 ? state.digital_driver.output_rate : 44100;
			return &sample;
		}
	}
	return nullptr;
}

static inline MSSBrowser3DListenerState *MSSBrowserFind3DListener(H3DPOBJECT handle)
{
	if (!MSSBrowserHandleValid(handle)) {
		return nullptr;
	}
	MSSBrowserRuntimeState &state = MSSBrowserRuntime();
	for (std::size_t i = 0; i < MSS_BROWSER_MAX_3D_LISTENERS; ++i) {
		MSSBrowser3DListenerState &listener = state.listeners3D[i];
		if (listener.allocated && !listener.closed && listener.handle == handle) {
			return &listener;
		}
	}
	return nullptr;
}

static inline MSSBrowser3DListenerState *MSSBrowserAllocate3DListener(H3DPOBJECT handle, HPROVIDER provider)
{
	MSSBrowserRuntimeState &state = MSSBrowserRuntime();
	for (std::size_t i = 0; i < MSS_BROWSER_MAX_3D_LISTENERS; ++i) {
		MSSBrowser3DListenerState &listener = state.listeners3D[i];
		if (!listener.allocated || listener.closed) {
			listener = MSSBrowser3DListenerState {};
			listener.allocated = true;
			listener.handle = handle;
			listener.provider = provider;
			return &listener;
		}
	}
	return nullptr;
}

static inline MSSBrowserSampleState *MSSBrowserAllocateSample(HSAMPLE handle)
{
	MSSBrowserRuntimeState &state = MSSBrowserRuntime();
	for (std::size_t i = 0; i < MSS_BROWSER_MAX_SAMPLES; ++i) {
		MSSBrowserSampleState &sample = state.samples[i];
		if (!sample.allocated || sample.released) {
			sample = MSSBrowserSampleState {};
			sample.allocated = true;
			sample.handle = handle;
			sample.playback_rate =
				state.digital_driver.output_rate > 0 ? state.digital_driver.output_rate : 44100;
			return &sample;
		}
	}
	return nullptr;
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
	const HSAMPLE handle = static_cast<HSAMPLE>(MSSBrowserRuntime().next_sample_handle++);
	if (MSSBrowserAllocateSample(handle) == nullptr) {
		return static_cast<HSAMPLE>(MSSInvalidHandle());
	}
	return handle;
}
static inline void AIL_release_sample_handle(HSAMPLE sample)
{
	MSSBrowserSampleState *state = MSSBrowserFindSample(sample);
	if (state != nullptr) {
		state->released = true;
		state->allocated = false;
		state->status = SMP_DONE;
		state->eos_callback = nullptr;
	}
}
static inline void AIL_init_sample(HSAMPLE sample)
{
	MSSBrowserSampleState *state = MSSBrowserFindSample(sample);
	if (state != nullptr) {
		state->initialized = true;
		state->file_set = false;
		state->started = false;
		state->stopped = false;
		state->resumed = false;
		state->file_data = nullptr;
		state->file_flags = 0;
		state->status = SMP_STOPPED;
		state->ms_position = 0;
	}
}
static inline S32 AIL_set_sample_file(HSAMPLE sample, void *data, S32 flags)
{
	MSSBrowserSampleState *state = MSSBrowserFindSample(sample);
	if (state == nullptr || data == nullptr) {
		return 0;
	}
	state->file_data = data;
	state->file_flags = flags;
	state->file_set = true;
	return 1;
}
static inline void AIL_set_named_sample_file(HSAMPLE sample, char *, U8 *data, U32, S32 flags)
{
	AIL_set_sample_file(sample, data, flags);
}
static inline void AIL_start_sample(HSAMPLE sample)
{
	MSSBrowserSampleState *state = MSSBrowserFindSample(sample);
	if (state != nullptr && state->initialized && state->file_set) {
		state->started = true;
		state->stopped = false;
		state->resumed = false;
		state->status = SMP_PLAYING;
	}
}
static inline void AIL_stop_sample(HSAMPLE sample)
{
	MSSBrowserSampleState *state = MSSBrowserFindSample(sample);
	if (state != nullptr) {
		state->stopped = true;
		state->status = SMP_STOPPED;
	}
}
static inline void AIL_resume_sample(HSAMPLE sample)
{
	MSSBrowserSampleState *state = MSSBrowserFindSample(sample);
	if (state != nullptr && state->initialized && state->file_set) {
		state->resumed = true;
		state->stopped = false;
		state->status = SMP_PLAYING;
	}
}
static inline void AIL_end_sample(HSAMPLE sample)
{
	MSSBrowserSampleState *state = MSSBrowserFindSample(sample);
	if (state != nullptr) {
		state->status = SMP_DONE;
		if (state->eos_callback != nullptr) {
			state->eos_callback(sample);
		}
	}
}
static inline void AIL_set_sample_pan(HSAMPLE sample, S32 pan)
{
	MSSBrowserSampleState *state = MSSBrowserFindSample(sample);
	if (state != nullptr) {
		state->pan = pan;
	}
}
static inline S32 AIL_sample_pan(HSAMPLE sample)
{
	MSSBrowserSampleState *state = MSSBrowserFindSample(sample);
	return state != nullptr ? state->pan : 0;
}
static inline void AIL_set_sample_volume(HSAMPLE sample, S32 volume)
{
	MSSBrowserSampleState *state = MSSBrowserFindSample(sample);
	if (state != nullptr) {
		state->volume = volume;
	}
}
static inline S32 AIL_sample_volume(HSAMPLE sample)
{
	MSSBrowserSampleState *state = MSSBrowserFindSample(sample);
	return state != nullptr ? state->volume : 0;
}
static inline void AIL_set_sample_loop_count(HSAMPLE sample, S32 loopCount)
{
	MSSBrowserSampleState *state = MSSBrowserFindSample(sample);
	if (state != nullptr) {
		state->loop_count = loopCount;
	}
}
static inline S32 AIL_sample_loop_count(HSAMPLE sample)
{
	MSSBrowserSampleState *state = MSSBrowserFindSample(sample);
	return state != nullptr ? state->loop_count : 0;
}
static inline void AIL_set_sample_ms_position(HSAMPLE sample, S32 position)
{
	MSSBrowserSampleState *state = MSSBrowserFindSample(sample);
	if (state != nullptr) {
		state->ms_position = position;
	}
}
static inline S32 AIL_sample_status(HSAMPLE sample)
{
	MSSBrowserSampleState *state = MSSBrowserFindSample(sample);
	return state != nullptr ? state->status : SMP_DONE;
}
static inline void AIL_sample_ms_position(HSAMPLE sample, S32 *len, S32 *pos)
{
	MSSBrowserSampleState *state = MSSBrowserFindSample(sample);
	if (len != nullptr) {
		*len = state != nullptr ? state->ms_length : 0;
	}
	if (pos != nullptr) {
		*pos = state != nullptr ? state->ms_position : 0;
	}
}
static inline void AIL_set_sample_user_data(HSAMPLE sample, S32 index, S32 value)
{
	MSSBrowserSampleState *state = MSSBrowserFindSample(sample);
	if (state != nullptr && index >= 0 && index < 8) {
		state->user_data[index] = value;
	}
}
static inline S32 AIL_sample_user_data(HSAMPLE sample, S32 index)
{
	MSSBrowserSampleState *state = MSSBrowserFindSample(sample);
	return state != nullptr && index >= 0 && index < 8 ? state->user_data[index] : 0;
}
static inline void AIL_sample_volume_pan(HSAMPLE sample, F32 *volume, F32 *pan)
{
	MSSBrowserSampleState *state = MSSBrowserFindSample(sample);
	if (volume != nullptr) {
		*volume = state != nullptr ? state->volume_float : 0.0f;
	}
	if (pan != nullptr) {
		*pan = state != nullptr ? state->pan_float : 0.5f;
	}
}
static inline void AIL_set_sample_volume_pan(HSAMPLE sample, F32 volume, F32 pan)
{
	MSSBrowserSampleState *state = MSSBrowserFindSample(sample);
	if (state != nullptr) {
		state->volume_float = volume;
		state->pan_float = pan;
	}
}
static inline S32 AIL_sample_playback_rate(HSAMPLE sample)
{
	MSSBrowserSampleState *state = MSSBrowserFindSample(sample);
	return state != nullptr ? state->playback_rate : 0;
}
static inline void AIL_set_sample_playback_rate(HSAMPLE sample, S32 rate)
{
	MSSBrowserSampleState *state = MSSBrowserFindSample(sample);
	if (state != nullptr) {
		state->playback_rate = rate;
	}
}
static inline HPROVIDER AIL_set_sample_processor(HSAMPLE, U32, HPROVIDER) { return 0; }
static inline void AIL_set_filter_sample_preference(HSAMPLE, const char *, F32 *) {}
static inline AIL_sample_callback AIL_register_EOS_callback(HSAMPLE sample, AIL_sample_callback callback)
{
	MSSBrowserSampleState *state = MSSBrowserFindSample(sample);
	if (state == nullptr) {
		return callback;
	}
	AIL_sample_callback previous = state->eos_callback;
	state->eos_callback = callback;
	return previous;
}
static inline H3DSAMPLE AIL_allocate_3D_sample_handle(HPROVIDER provider)
{
	MSSBrowserRuntimeState &runtime = MSSBrowserRuntime();
	if (!MSSBrowserRuntimeStarted()
		|| !MSSBrowserProviderValid(provider)
		|| !runtime.provider_open[provider]) {
		return static_cast<H3DSAMPLE>(MSSInvalidHandle());
	}
	const H3DSAMPLE handle = static_cast<H3DSAMPLE>(runtime.next_3d_sample_handle++);
	if (MSSBrowserAllocate3DSample(handle, provider) == nullptr) {
		return static_cast<H3DSAMPLE>(MSSInvalidHandle());
	}
	return handle;
}
static inline void AIL_release_3D_sample_handle(H3DSAMPLE sample)
{
	MSSBrowser3DSampleState *state = MSSBrowserFind3DSample(sample);
	if (state != nullptr) {
		state->released = true;
		state->allocated = false;
		state->status = SMP_DONE;
		state->eos_callback = nullptr;
	}
}
static inline U32 AIL_set_3D_sample_file(H3DSAMPLE sample, U8 *data)
{
	MSSBrowser3DSampleState *state = MSSBrowserFind3DSample(sample);
	if (state == nullptr || data == nullptr) {
		return 0;
	}
	state->file_data = data;
	state->file_set = true;
	state->status = SMP_STOPPED;
	return 1;
}
static inline U32 AIL_set_3D_sample_file(H3DSAMPLE sample, void *data)
{
	return AIL_set_3D_sample_file(sample, static_cast<U8 *>(data));
}
static inline void AIL_start_3D_sample(H3DSAMPLE sample)
{
	MSSBrowser3DSampleState *state = MSSBrowserFind3DSample(sample);
	if (state != nullptr && state->file_set) {
		state->started = true;
		state->stopped = false;
		state->resumed = false;
		state->ended = false;
		state->status = SMP_PLAYING;
	}
}
static inline void AIL_stop_3D_sample(H3DSAMPLE sample)
{
	MSSBrowser3DSampleState *state = MSSBrowserFind3DSample(sample);
	if (state != nullptr) {
		state->stopped = true;
		state->status = SMP_STOPPED;
	}
}
static inline void AIL_resume_3D_sample(H3DSAMPLE sample)
{
	MSSBrowser3DSampleState *state = MSSBrowserFind3DSample(sample);
	if (state != nullptr && state->file_set) {
		state->resumed = true;
		state->stopped = false;
		state->status = SMP_PLAYING;
	}
}
static inline void AIL_end_3D_sample(H3DSAMPLE sample)
{
	MSSBrowser3DSampleState *state = MSSBrowserFind3DSample(sample);
	if (state != nullptr) {
		state->ended = true;
		state->status = SMP_DONE;
		if (state->eos_callback != nullptr) {
			state->eos_callback(sample);
		}
	}
}
static inline void AIL_set_3D_sample_volume(H3DSAMPLE sample, S32 volume)
{
	MSSBrowser3DSampleState *state = MSSBrowserFind3DSample(sample);
	if (state != nullptr) {
		state->volume = volume;
	}
}
static inline S32 AIL_3D_sample_volume(H3DSAMPLE sample)
{
	MSSBrowser3DSampleState *state = MSSBrowserFind3DSample(sample);
	return state != nullptr ? state->volume : 0;
}
static inline void AIL_set_3D_sample_loop_count(H3DSAMPLE sample, S32 loopCount)
{
	MSSBrowser3DSampleState *state = MSSBrowserFind3DSample(sample);
	if (state != nullptr) {
		state->loop_count = loopCount;
	}
}
static inline S32 AIL_3D_sample_loop_count(H3DSAMPLE sample)
{
	MSSBrowser3DSampleState *state = MSSBrowserFind3DSample(sample);
	return state != nullptr ? state->loop_count : 0;
}
static inline void AIL_set_3D_sample_offset(H3DSAMPLE sample, U32 offset)
{
	MSSBrowser3DSampleState *state = MSSBrowserFind3DSample(sample);
	if (state != nullptr) {
		state->offset = offset;
	}
}
static inline U32 AIL_3D_sample_offset(H3DSAMPLE sample)
{
	MSSBrowser3DSampleState *state = MSSBrowserFind3DSample(sample);
	return state != nullptr ? state->offset : 0;
}
static inline U32 AIL_3D_sample_length(H3DSAMPLE sample)
{
	MSSBrowser3DSampleState *state = MSSBrowserFind3DSample(sample);
	return state != nullptr ? state->length : 0;
}
static inline S32 AIL_3D_sample_status(H3DSAMPLE sample)
{
	MSSBrowser3DSampleState *state = MSSBrowserFind3DSample(sample);
	return state != nullptr ? state->status : SMP_DONE;
}
static inline void AIL_set_3D_object_user_data(H3DPOBJECT object, S32 index, S32 value)
{
	if (index < 0 || index >= 8) {
		return;
	}
	MSSBrowser3DSampleState *sample = MSSBrowserFind3DSample(object);
	if (sample != nullptr) {
		sample->user_data[index] = value;
		return;
	}
	MSSBrowser3DListenerState *listener = MSSBrowserFind3DListener(object);
	if (listener != nullptr) {
		listener->user_data[index] = value;
	}
}
static inline S32 AIL_3D_object_user_data(H3DPOBJECT object, S32 index)
{
	if (index < 0 || index >= 8) {
		return 0;
	}
	MSSBrowser3DSampleState *sample = MSSBrowserFind3DSample(object);
	if (sample != nullptr) {
		return sample->user_data[index];
	}
	MSSBrowser3DListenerState *listener = MSSBrowserFind3DListener(object);
	return listener != nullptr ? listener->user_data[index] : 0;
}
static inline void AIL_set_3D_user_data(H3DSAMPLE sample, S32 index, S32 value)
{
	AIL_set_3D_object_user_data(sample, index, value);
}
static inline S32 AIL_3D_user_data(H3DSAMPLE sample, S32 index)
{
	return AIL_3D_object_user_data(sample, index);
}
static inline S32 AIL_3D_sample_playback_rate(H3DSAMPLE sample)
{
	MSSBrowser3DSampleState *state = MSSBrowserFind3DSample(sample);
	return state != nullptr ? state->playback_rate : 0;
}
static inline void AIL_set_3D_sample_playback_rate(H3DSAMPLE sample, S32 rate)
{
	MSSBrowser3DSampleState *state = MSSBrowserFind3DSample(sample);
	if (state != nullptr) {
		state->playback_rate = rate;
	}
}
static inline void AIL_set_3D_sample_occlusion(H3DSAMPLE sample, F32 occlusion)
{
	MSSBrowser3DSampleState *state = MSSBrowserFind3DSample(sample);
	if (state != nullptr) {
		state->occlusion = occlusion;
	}
}
static inline void AIL_set_3D_position(H3DPOBJECT object, F32 x, F32 y, F32 z)
{
	MSSBrowser3DSampleState *sample = MSSBrowserFind3DSample(object);
	if (sample != nullptr) {
		sample->position = { x, y, z };
		return;
	}
	MSSBrowser3DListenerState *listener = MSSBrowserFind3DListener(object);
	if (listener != nullptr) {
		listener->position = { x, y, z };
	}
}
static inline void AIL_set_3D_orientation(
	H3DPOBJECT object,
	F32 frontX,
	F32 frontY,
	F32 frontZ,
	F32 upX,
	F32 upY,
	F32 upZ)
{
	MSSBrowser3DListenerState *listener = MSSBrowserFind3DListener(object);
	if (listener != nullptr) {
		listener->front = { frontX, frontY, frontZ };
		listener->up = { upX, upY, upZ };
	}
}
static inline void AIL_set_3D_velocity_vector(H3DPOBJECT object, F32 x, F32 y, F32 z)
{
	MSSBrowser3DSampleState *sample = MSSBrowserFind3DSample(object);
	if (sample != nullptr) {
		sample->velocity = { x, y, z };
		return;
	}
	MSSBrowser3DListenerState *listener = MSSBrowserFind3DListener(object);
	if (listener != nullptr) {
		listener->velocity = { x, y, z };
	}
}
static inline void AIL_set_3D_sample_distances(H3DSAMPLE sample, F32 minDistance, F32 maxDistance)
{
	MSSBrowser3DSampleState *state = MSSBrowserFind3DSample(sample);
	if (state != nullptr) {
		state->min_distance = minDistance;
		state->max_distance = maxDistance;
	}
}
static inline void AIL_set_3D_sample_effects_level(H3DSAMPLE sample, F32 effectsLevel)
{
	MSSBrowser3DSampleState *state = MSSBrowserFind3DSample(sample);
	if (state != nullptr) {
		state->effects_level = effectsLevel;
	}
}
static inline AIL_3D_sample_callback AIL_register_3D_EOS_callback(
	H3DSAMPLE sample,
	AIL_3D_sample_callback callback)
{
	MSSBrowser3DSampleState *state = MSSBrowserFind3DSample(sample);
	if (state == nullptr) {
		return callback;
	}
	AIL_3D_sample_callback previous = state->eos_callback;
	state->eos_callback = callback;
	return previous;
}
static inline H3DPOBJECT AIL_3D_open_listener(HPROVIDER provider)
{
	MSSBrowserRuntimeState &runtime = MSSBrowserRuntime();
	if (!MSSBrowserRuntimeStarted()
		|| !MSSBrowserProviderValid(provider)
		|| !runtime.provider_open[provider]) {
		return static_cast<H3DPOBJECT>(MSSInvalidHandle());
	}
	const H3DPOBJECT handle = static_cast<H3DPOBJECT>(runtime.next_listener_handle++);
	if (MSSBrowserAllocate3DListener(handle, provider) == nullptr) {
		return static_cast<H3DPOBJECT>(MSSInvalidHandle());
	}
	return handle;
}
static inline H3DPOBJECT AIL_open_3D_listener(HPROVIDER provider) { return AIL_3D_open_listener(provider); }
static inline void AIL_close_3D_listener(H3DPOBJECT listener)
{
	MSSBrowser3DListenerState *state = MSSBrowserFind3DListener(listener);
	if (state != nullptr) {
		state->closed = true;
		state->allocated = false;
	}
}
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
	if (!MSSBrowserRuntimeStarted() || !MSSBrowserProviderValid(provider) || provider > 2) {
		return 1;
	}
	MSSBrowserRuntime().provider_open[provider] = true;
	return M3D_NOERR;
}
static inline void AIL_close_3D_provider(HPROVIDER provider)
{
	if (MSSBrowserProviderValid(provider)) {
		MSSBrowserRuntime().provider_open[provider] = false;
	}
}
static inline void AIL_set_3D_speaker_type(HPROVIDER provider, S32 speakerType)
{
	if (MSSBrowserProviderValid(provider)) {
		MSSBrowserRuntime().provider_speaker_type[provider] = speakerType;
	}
}
static inline S32 AIL_enumerate_filters(HPROENUM *next, HPROVIDER *provider, char **name)
{
	static char monoDelayName[] = "Mono Delay Filter";
	static char lowPassName[] = "Low Pass Filter";
	if (next == nullptr || provider == nullptr || name == nullptr || !MSSBrowserRuntimeStarted()) {
		return 0;
	}
	if (*next == HPROENUM_FIRST) {
		*provider = 0x6001;
		*name = monoDelayName;
		*next = 1;
		return 1;
	}
	if (*next == 1) {
		*provider = 0x6002;
		*name = lowPassName;
		*next = 2;
		return 1;
	}
	return 0;
}
static inline HSTREAM AIL_open_stream(HDIGDRIVER driver, const char *filename, S32 flags)
{
	if (driver == nullptr || filename == nullptr || !MSSBrowserRuntimeStarted()) {
		return static_cast<HSTREAM>(MSSInvalidHandle());
	}
	const HSTREAM handle = static_cast<HSTREAM>(MSSBrowserRuntime().next_stream_handle++);
	MSSBrowserStreamState *stream = MSSBrowserAllocateStream(handle);
	if (stream == nullptr) {
		return static_cast<HSTREAM>(MSSInvalidHandle());
	}
	stream->driver = driver;
	stream->filename = filename;
	stream->flags = flags;
	stream->status = SMP_STOPPED;
	return handle;
}
static inline HSTREAM AIL_open_stream_by_sample(HDIGDRIVER driver, HSAMPLE sample, const char *filename, S32 flags)
{
	if (MSSBrowserFindSample(sample) == nullptr) {
		return static_cast<HSTREAM>(MSSInvalidHandle());
	}
	const HSTREAM handle = AIL_open_stream(driver, filename, flags);
	MSSBrowserStreamState *stream = MSSBrowserFindStream(handle);
	if (stream != nullptr) {
		stream->open_by_sample = true;
		stream->sample = sample;
	}
	return handle;
}
static inline void AIL_start_stream(HSTREAM stream)
{
	MSSBrowserStreamState *state = MSSBrowserFindStream(stream);
	if (state != nullptr) {
		state->started = true;
		state->paused = false;
		state->resumed = false;
		state->status = SMP_PLAYING;
	}
}
static inline void AIL_pause_stream(HSTREAM stream, S32 pause)
{
	MSSBrowserStreamState *state = MSSBrowserFindStream(stream);
	if (state != nullptr) {
		if (pause != 0) {
			state->paused = true;
			state->status = SMP_STOPPED;
		} else {
			state->resumed = true;
			state->paused = false;
			if (state->started) {
				state->status = SMP_PLAYING;
			}
		}
	}
}
static inline void AIL_close_stream(HSTREAM stream)
{
	MSSBrowserStreamState *state = MSSBrowserFindStream(stream);
	if (state != nullptr) {
		state->closed = true;
		state->allocated = false;
		state->status = SMP_DONE;
		state->eos_callback = nullptr;
	}
}
static inline S32 AIL_stream_status(HSTREAM stream)
{
	MSSBrowserStreamState *state = MSSBrowserFindStream(stream);
	return state != nullptr ? state->status : SMP_DONE;
}
static inline void AIL_set_stream_pan(HSTREAM stream, S32 pan)
{
	MSSBrowserStreamState *state = MSSBrowserFindStream(stream);
	if (state != nullptr) {
		state->pan = pan;
	}
}
static inline S32 AIL_stream_pan(HSTREAM stream)
{
	MSSBrowserStreamState *state = MSSBrowserFindStream(stream);
	return state != nullptr ? state->pan : 0;
}
static inline void AIL_set_stream_volume(HSTREAM stream, S32 volume)
{
	MSSBrowserStreamState *state = MSSBrowserFindStream(stream);
	if (state != nullptr) {
		state->volume = volume;
	}
}
static inline S32 AIL_stream_volume(HSTREAM stream)
{
	MSSBrowserStreamState *state = MSSBrowserFindStream(stream);
	return state != nullptr ? state->volume : 0;
}
static inline void AIL_set_stream_loop_block(HSTREAM stream, S32 loopStart, S32 loopEnd)
{
	MSSBrowserStreamState *state = MSSBrowserFindStream(stream);
	if (state != nullptr) {
		state->loop_start = loopStart;
		state->loop_end = loopEnd;
	}
}
static inline void AIL_set_stream_loop_count(HSTREAM stream, S32 loopCount)
{
	MSSBrowserStreamState *state = MSSBrowserFindStream(stream);
	if (state != nullptr) {
		state->loop_count = loopCount;
	}
}
static inline S32 AIL_stream_loop_count(HSTREAM stream)
{
	MSSBrowserStreamState *state = MSSBrowserFindStream(stream);
	return state != nullptr ? state->loop_count : 0;
}
static inline void AIL_set_stream_ms_position(HSTREAM stream, S32 position)
{
	MSSBrowserStreamState *state = MSSBrowserFindStream(stream);
	if (state != nullptr) {
		state->ms_position = position;
	}
}
static inline void AIL_stream_ms_position(HSTREAM stream, S32 *len, S32 *pos)
{
	MSSBrowserStreamState *state = MSSBrowserFindStream(stream);
	if (len != nullptr) {
		*len = state != nullptr ? state->ms_length : 0;
	}
	if (pos != nullptr) {
		*pos = state != nullptr ? state->ms_position : 0;
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
static inline S32 AIL_stream_playback_rate(HSTREAM stream)
{
	MSSBrowserStreamState *state = MSSBrowserFindStream(stream);
	return state != nullptr ? state->playback_rate : 0;
}
static inline void AIL_set_stream_playback_rate(HSTREAM stream, S32 rate)
{
	MSSBrowserStreamState *state = MSSBrowserFindStream(stream);
	if (state != nullptr) {
		state->playback_rate = rate;
	}
}
static inline void AIL_stream_volume_pan(HSTREAM stream, F32 *volume, F32 *pan)
{
	MSSBrowserStreamState *state = MSSBrowserFindStream(stream);
	if (volume != nullptr) {
		*volume = state != nullptr ? state->volume_float : 0.0f;
	}
	if (pan != nullptr) {
		*pan = state != nullptr ? state->pan_float : 0.5f;
	}
}
static inline void AIL_set_stream_volume_pan(HSTREAM stream, F32 volume, F32 pan)
{
	MSSBrowserStreamState *state = MSSBrowserFindStream(stream);
	if (state != nullptr) {
		state->volume_float = volume;
		state->pan_float = pan;
	}
}
static inline AIL_stream_callback AIL_register_stream_callback(HSTREAM stream, AIL_stream_callback callback)
{
	MSSBrowserStreamState *state = MSSBrowserFindStream(stream);
	if (state == nullptr) {
		return callback;
	}
	AIL_stream_callback previous = state->eos_callback;
	state->eos_callback = callback;
	return previous;
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
