#ifndef WASM_AUDIO_MANAGER_PROBE_H
#define WASM_AUDIO_MANAGER_PROBE_H

#include <string>

// Boot-time runtime probe that constructs the original MilesAudioManager
// (GeneralsMD/Code/GameEngineDevice/Source/MilesAudioDevice/MilesAudioManager.cpp),
// assigns the real TheAudio singleton, runs the real MilesAudioManager::init()
// (original AudioManager::init() INI loads + openDevice() through the browser
// MSS shim + AIL_set_file_callbacks), captures the resulting state, and tears
// the manager down through its real destructor (closeDevice()/AIL_shutdown()).
struct AudioManagerRuntimeProbeResult
{
	bool attempted = false;
	bool ok = false;
	const char *source =
		"MilesAudioManager.cpp::init/openDevice + GameAudio.cpp::AudioManager::init";
	const char *status = "not_attempted";
	const char *next_required = "runtimeArchiveSet";

	// preconditions observed at boot
	bool runtime_archive_registered = false;
	bool startup_singletons_ready = false;
	bool audio_startup_files_ready = false;
	bool memory_manager_ready = false;
	bool global_data_ready = false;
	bool file_system_ready = false;
	bool the_audio_was_null = false;

	// createAudioManager() ownership
	bool constructed = false;
	bool the_audio_owned = false;
	bool init_ran = false;
	bool init_threw = false;
	std::string init_error;

	// original AudioManager::init() results (real INI parse path)
	std::string audio_root;
	int output_rate = 0;
	int output_bits = 0;
	int output_channels = 0;
	int sample_count_2d = 0;
	int sample_count_3d = 0;
	int stream_count = 0;
	unsigned music_track_count = 0;
	unsigned sound_event_count = 0;
	unsigned streaming_event_count = 0;
	bool misc_audio_parsed = false;
	bool music_already_loaded = false;
	// GameEngine.cpp line 435: if (!TheAudio->isMusicAlreadyLoaded()) setQuitting(TRUE)
	bool would_set_quitting = true;
	std::string checked_music_track;
	std::string checked_music_filename;
	unsigned os_display_warning_prompts = 0;
	float music_volume = 0.0f;
	float sound_volume = 0.0f;
	float sound3d_volume = 0.0f;
	float speech_volume = 0.0f;
	std::string preferred_provider;
	std::string preferred_speaker;

	// openDevice() effects observed in the browser MSS runtime state
	bool mss_redist_directory_set = false;
	bool mss_startup_called = false;
	bool mss_quick_startup_ok = false;
	bool mss_file_callbacks_set = false;
	int mss_output_rate = 0;
	int mss_output_bits = 0;
	int mss_output_channels = 0;
	unsigned provider_count = 0;
	bool provider_selected = false;
	std::string selected_provider_name;
	bool selected_provider_open = false;
	int selected_speaker_type = -1;
	unsigned num_2d_samples = 0;
	unsigned num_3d_samples = 0;
	unsigned num_streams = 0;
	unsigned mss_2d_samples_allocated = 0;
	unsigned mss_3d_samples_allocated = 0;
	unsigned mss_listeners_allocated = 0;

	// real-destructor teardown (closeDevice() -> AIL_shutdown())
	bool torn_down = false;
	bool mss_shutdown_called = false;
	bool the_audio_cleared = false;
};

const AudioManagerRuntimeProbeResult &wasm_audio_manager_probe_install(
	bool runtime_archive_registered,
	bool audio_startup_files_ready);
const AudioManagerRuntimeProbeResult &wasm_audio_manager_probe_state();
const char *wasm_audio_manager_probe_state_json();

#endif // WASM_AUDIO_MANAGER_PROBE_H
