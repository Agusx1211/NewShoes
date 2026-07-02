// Boot-time ownership probe for GameEngine.cpp line 434:
//   initSubsystem(TheAudio, "TheAudio", createAudioManager(), NULL)
//
// This drives the original MilesAudioManager (the real createAudioManager()
// concrete from Win32GameEngine.h) inside the linked cnc-port runtime:
// construct -> TheAudio assignment -> real MilesAudioManager::init()
// (original AudioManager::init() INI loads through the real INI runtime,
// openDevice() through the browser MSS shim, audio cache sizing and
// AIL_set_file_callbacks) -> state capture -> real destructor teardown
// (closeDevice() -> AIL_shutdown()).

#include "wasm_audio_manager_probe.h"

#include "wasm_startup_singletons_probe.h"

#include "Common/AudioAffect.h"
#include "Common/Errors.h"
#include "Common/AudioEventInfo.h"
#include "Common/AudioEventRTS.h"
#include "Common/AudioSettings.h"
#include "Common/ArchiveFileSystem.h"
#include "Common/FileSystem.h"
#include "Common/GameAudio.h"
#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/INIException.h"
#include "Common/MiscAudio.h"
#include "Common/OSDisplay.h"
#include "Common/Player.h"
#include "MilesAudioDevice/MilesAudioManager.h"
#include "MSS/MSS.h"

#include <cstdio>
#include <string>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

namespace {

AudioManagerRuntimeProbeResult g_audio_manager_probe_state;
unsigned g_os_display_warning_prompts = 0;

// Force wasm-ld to extract the original audio INI parser objects from
// zh_gameengine_common_core. INI.cpp's block-parser table references
// INI::parseAudioEventDefinition / parseDialogDefinition /
// parseMusicTrackDefinition / parseMiscAudio, but wasm_real_ini_compat.cpp
// carries weak throwing placeholders for probe targets that do not link the
// audio runtime. Referencing symbols that only INIAudioEventInfo.cpp and
// INIMiscAudio.cpp define guarantees the original strong parsers own those
// entries in the linked cnc-port runtime.
__attribute__((used)) const void *const g_original_audio_ini_parser_anchors[] = {
	static_cast<const void *>(AudioEventInfo::m_audioEventInfo),
	static_cast<const void *>(MiscAudio::m_fieldParseTable),
};

const char *json_bool(bool value)
{
	return value ? "true" : "false";
}

std::string json_escape(const std::string &value)
{
	std::string escaped;
	escaped.reserve(value.size());
	for (char ch : value) {
		switch (ch) {
			case '\\':
				escaped += "\\\\";
				break;
			case '"':
				escaped += "\\\"";
				break;
			case '\n':
				escaped += "\\n";
				break;
			case '\r':
				escaped += "\\r";
				break;
			case '\t':
				escaped += "\\t";
				break;
			default:
				escaped += ch;
				break;
		}
	}
	return escaped;
}

void capture_audio_manager_state(
	MilesAudioManager &audio,
	AudioManagerRuntimeProbeResult &result)
{
	const AudioSettings *settings = audio.getAudioSettings();
	if (settings != nullptr) {
		result.audio_root = settings->m_audioRoot.str();
		result.output_rate = settings->m_outputRate;
		result.output_bits = settings->m_outputBits;
		result.output_channels = settings->m_outputChannels;
		result.sample_count_2d = settings->m_sampleCount2D;
		result.sample_count_3d = settings->m_sampleCount3D;
		result.stream_count = settings->m_streamCount;
		result.preferred_provider =
			settings->m_preferred3DProvider[MAX_HW_PROVIDERS].str();
		result.preferred_speaker = audio
			.translateUnsignedIntToSpeakerType(settings->m_defaultSpeakerType2D)
			.str();
	}

	std::vector<AudioEventInfo *> music_events;
	std::vector<AudioEventInfo *> sound_events;
	std::vector<AudioEventInfo *> streaming_events;
	audio.findAllAudioEventsOfType(AT_Music, music_events);
	audio.findAllAudioEventsOfType(AT_SoundEffect, sound_events);
	audio.findAllAudioEventsOfType(AT_Streaming, streaming_events);
	result.music_track_count = music_events.size();
	result.sound_event_count = sound_events.size();
	result.streaming_event_count = streaming_events.size();

	const MiscAudio *misc_audio = audio.getMiscAudio();
	result.misc_audio_parsed =
		misc_audio != nullptr &&
		!misc_audio->m_guiClickSound.getEventName().isEmpty();

	// Mirror the file check AudioManager::isMusicAlreadyLoaded() performs on
	// the last AT_Music entry so the JSON can name the track it proved.
	if (!music_events.empty() && music_events.back() != nullptr) {
		const AudioEventInfo *music_info = music_events.back();
		result.checked_music_track = music_info->m_audioName.str();
		AudioEventRTS music_event;
		music_event.setAudioEventInfo(music_info);
		music_event.generateFilename();
		result.checked_music_filename = music_event.getFilename().str();
	}
	result.music_already_loaded = audio.isMusicAlreadyLoaded();
	result.would_set_quitting = !result.music_already_loaded;

	result.music_volume = audio.getVolume(AudioAffect_Music);
	result.sound_volume = audio.getVolume(AudioAffect_Sound);
	result.sound3d_volume = audio.getVolume(AudioAffect_Sound3D);
	result.speech_volume = audio.getVolume(AudioAffect_Speech);

	result.provider_count = audio.getProviderCount();
	result.provider_selected = audio.getSelectedProvider() != PROVIDER_ERROR;
	if (result.provider_selected) {
		result.selected_provider_name =
			audio.getProviderName(audio.getSelectedProvider()).str();
	}
	result.selected_speaker_type = static_cast<int>(audio.getSpeakerType());
	result.num_2d_samples = audio.getNum2DSamples();
	result.num_3d_samples = audio.getNum3DSamples();
	result.num_streams = audio.getNumStreams();

	const MSSBrowserRuntimeState &runtime = MSSBrowserRuntime();
	result.mss_redist_directory_set = runtime.redist_directory_set;
	result.mss_startup_called = runtime.startup_called;
	result.mss_quick_startup_ok =
		runtime.quick_startup_called && runtime.quick_startup_ok;
	result.mss_file_callbacks_set = runtime.file_callbacks_set;
	result.mss_output_rate = runtime.output_rate;
	result.mss_output_bits = runtime.output_bits;
	result.mss_output_channels = runtime.output_channels;
	for (bool provider_open : runtime.provider_open) {
		if (provider_open) {
			result.selected_provider_open = true;
			break;
		}
	}
	for (const MSSBrowserSampleState &sample : runtime.samples) {
		if (sample.allocated && sample.initialized && !sample.released) {
			++result.mss_2d_samples_allocated;
		}
	}
	for (const MSSBrowser3DSampleState &sample : runtime.samples3D) {
		if (sample.allocated && !sample.released) {
			++result.mss_3d_samples_allocated;
		}
	}
	for (const MSSBrowser3DListenerState &listener : runtime.listeners3D) {
		if (listener.allocated && !listener.closed) {
			++result.mss_listeners_allocated;
		}
	}
}

void finish_status(AudioManagerRuntimeProbeResult &result)
{
	if (!result.runtime_archive_registered) {
		result.status = "missing_runtime_archives";
		result.next_required = "runtimeArchiveSet";
		return;
	}
	if (!result.startup_singletons_ready) {
		result.status = "startup_singletons_not_ready";
		result.next_required = "startupSingletonOwnership";
		return;
	}
	if (!result.audio_startup_files_ready) {
		result.status = "audio_startup_files_missing";
		result.next_required = "audioStartupFiles";
		return;
	}
	if (result.init_threw) {
		result.status = "original_audio_manager_init_threw";
		result.next_required = "createAudioManager";
		return;
	}
	if (!result.constructed || !result.the_audio_owned || !result.init_ran) {
		result.status = "original_audio_manager_init_incomplete";
		result.next_required = "createAudioManager";
		return;
	}
	if (!result.music_already_loaded) {
		// GameEngine.cpp line 435 would setQuitting(TRUE) on this boot.
		result.status = "music_not_loaded_would_set_quitting";
		result.next_required = "musicTrackArchive";
		return;
	}
	if (!result.mss_startup_called ||
		!result.mss_quick_startup_ok ||
		!result.mss_file_callbacks_set ||
		!result.provider_selected ||
		!result.selected_provider_open ||
		result.num_2d_samples == 0 ||
		result.num_3d_samples == 0 ||
		result.num_streams == 0 ||
		result.mss_2d_samples_allocated != result.num_2d_samples ||
		result.mss_3d_samples_allocated != result.num_3d_samples ||
		result.mss_listeners_allocated != 1) {
		result.status = "open_device_state_mismatch";
		result.next_required = "createAudioManager";
		return;
	}
	if (!result.torn_down ||
		!result.mss_shutdown_called ||
		!result.the_audio_cleared) {
		result.status = "original_audio_manager_teardown_incomplete";
		result.next_required = "createAudioManager";
		return;
	}

	result.ok = true;
	result.status = "ready";
	result.next_required = "createFunctionLexicon";
}

} // namespace

// Boundary: AudioManager::shouldPlayLocally (GameAudio.cpp lines 1075/1079)
// consults Player::getRelationship for owner/ally-scoped voice events during
// live playback. The full original Player.cpp is not linked into cnc-port
// yet; this weak placeholder keeps the link closed and yields to the real
// Player.cpp the moment it joins the runtime. It is never reached by the
// boot-time init()/openDevice() path this probe drives.
Relationship __attribute__((weak)) Player::getRelationship(const Team *) const
{
	return NEUTRAL;
}

// Browser platform boundary for Common/OSDisplay.h. The original
// Win32OSDisplay.cpp raises a modal Win32 MessageBox; a headless browser boot
// cannot block on a modal prompt, so log the prompt and answer CANCEL exactly
// like a user dismissing the original insert-CD dialog
// (AudioManager::init(), GameAudio.cpp line 262).
OSDisplayButtonType OSDisplayWarningBox(
	AsciiString promptLabel,
	AsciiString messageLabel,
	UnsignedInt buttonFlags,
	UnsignedInt otherFlags)
{
	++g_os_display_warning_prompts;
	std::printf(
		"cnc-port: OSDisplayWarningBox %s / %s (buttons=%u other=%u) -> OSDBT_CANCEL\n",
		promptLabel.str(),
		messageLabel.str(),
		buttonFlags,
		otherFlags);
	return OSDBT_CANCEL;
}

const AudioManagerRuntimeProbeResult &wasm_audio_manager_probe_install(
	bool runtime_archive_registered,
	bool audio_startup_files_ready)
{
	AudioManagerRuntimeProbeResult result;
	result.attempted = true;
	result.runtime_archive_registered = runtime_archive_registered;
	result.startup_singletons_ready = wasm_startup_singletons_state().ok;
	result.audio_startup_files_ready = audio_startup_files_ready;
	g_os_display_warning_prompts = 0;

	result.memory_manager_ready = isMemoryManagerOfficiallyInited();
	result.file_system_ready = TheFileSystem != nullptr;
	result.the_audio_was_null = TheAudio == nullptr;
	const bool preconditions_ready =
		result.runtime_archive_registered &&
		result.startup_singletons_ready &&
		result.audio_startup_files_ready &&
		result.memory_manager_ready &&
		result.file_system_ready &&
		result.the_audio_was_null;

	if (!preconditions_ready) {
		finish_status(result);
		g_audio_manager_probe_state = result;
		return g_audio_manager_probe_state;
	}

	MSSBrowserRuntimeReset();

	// Probe-scoped residency for the original GlobalData singleton, matching
	// the established GlobalData/CommandLine probe pattern: the original
	// GlobalData constructor supplies the real defaults (m_audioOn == TRUE)
	// that MilesAudioManager::openDevice() consults through TheGlobalData.
	GlobalData *old_global_data = TheWritableGlobalData;
	GlobalData *global_data = nullptr;

	MilesAudioManager *audio = nullptr;
	try {
		global_data = new GlobalData;
		TheWritableGlobalData = global_data;
		result.global_data_ready = TheWritableGlobalData != nullptr;

		// GameEngine.cpp line 434: initSubsystem(TheAudio, "TheAudio",
		// createAudioManager(), NULL); Win32GameEngine::createAudioManager()
		// returns NEW MilesAudioManager.
		audio = NEW MilesAudioManager;
		result.constructed = true;
		TheAudio = audio;
		result.the_audio_owned = TheAudio == audio;

		// SubsystemInterfaceList::initSubsystem() -> MilesAudioManager::init():
		// original AudioManager::init() INI loads through the real INI runtime,
		// openDevice() through the browser MSS shim, audio cache sizing and
		// AIL_set_file_callbacks.
		audio->init();
		result.init_ran = true;

		capture_audio_manager_state(*audio, result);
	} catch (INIException &e) {
		result.init_threw = true;
		result.init_error = std::string("INIException ") + (e.mFailureMessage != nullptr ? e.mFailureMessage : "?");
	} catch (ErrorCode code) {
		result.init_threw = true;
		char buffer[64];
		std::snprintf(buffer, sizeof(buffer), "ErrorCode 0x%08x", (unsigned)code);
		result.init_error = buffer;
	} catch (int code) {
		result.init_threw = true;
		char buffer[64];
		std::snprintf(buffer, sizeof(buffer), "int %d", code);
		result.init_error = buffer;
	} catch (unsigned code) {
		result.init_threw = true;
		char buffer[64];
		std::snprintf(buffer, sizeof(buffer), "unsigned %u", code);
		result.init_error = buffer;
	} catch (const char *msg) {
		result.init_threw = true;
		result.init_error = std::string("cstr ") + msg;
	} catch (...) {
		result.init_threw = true;
		result.init_error = "MilesAudioManager init raised an exception";
	}

	result.os_display_warning_prompts = g_os_display_warning_prompts;

	if (audio != nullptr) {
		try {
			// Real teardown path: ~MilesAudioManager() -> closeDevice() ->
			// freeAllMilesHandles() + unselectProvider() + AIL_shutdown(),
			// then clears TheAudio.
			delete audio;
			result.torn_down = true;
		} catch (...) {
			result.torn_down = false;
		}
		audio = nullptr;
	}

	result.mss_shutdown_called = MSSBrowserRuntime().shutdown_called;
	result.the_audio_cleared = TheAudio == nullptr;
	if (!result.the_audio_cleared) {
		// Never leave a destroyed manager behind the global singleton.
		TheAudio = nullptr;
	}

	if (global_data != nullptr) {
		delete global_data;
	}
	TheWritableGlobalData = old_global_data;

	finish_status(result);
	g_audio_manager_probe_state = result;
	return g_audio_manager_probe_state;
}

const AudioManagerRuntimeProbeResult &wasm_audio_manager_probe_state()
{
	return g_audio_manager_probe_state;
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_audio_manager_runtime()
{
	// Returns the state captured when cnc_port_boot() drove the original
	// MilesAudioManager through init()/openDevice()/teardown.
	return wasm_audio_manager_probe_state_json();
}

const char *wasm_audio_manager_probe_state_json()
{
	const AudioManagerRuntimeProbeResult &state = g_audio_manager_probe_state;
	const std::string source_json = json_escape(state.source);
	const std::string status_json = json_escape(state.status);
	const std::string next_required_json = json_escape(state.next_required);
	const std::string init_error_json = json_escape(state.init_error);
	const std::string audio_root_json = json_escape(state.audio_root);
	const std::string checked_track_json = json_escape(state.checked_music_track);
	const std::string checked_filename_json =
		json_escape(state.checked_music_filename);
	const std::string preferred_provider_json =
		json_escape(state.preferred_provider);
	const std::string preferred_speaker_json =
		json_escape(state.preferred_speaker);
	const std::string selected_provider_json =
		json_escape(state.selected_provider_name);

	static char json[4096];
	std::snprintf(json, sizeof(json),
		"{\"attempted\":%s,\"ok\":%s,\"source\":\"%s\","
		"\"status\":\"%s\",\"nextRequired\":\"%s\","
		"\"gameEngineInit\":{\"factory\":\"createAudioManager\",\"line\":434,"
		"\"originalConcrete\":\"MilesAudioManager\","
		"\"musicCheckLine\":435,\"wouldSetQuitting\":%s},"
		"\"runtimeArchiveRegistered\":%s,"
		"\"startupSingletonsReady\":%s,"
		"\"audioStartupFilesReady\":%s,"
		"\"memoryManagerReady\":%s,\"globalDataReady\":%s,"
		"\"fileSystemReady\":%s,\"theAudioWasNull\":%s,"
		"\"constructed\":%s,\"theAudioOwned\":%s,"
		"\"initRan\":%s,\"initThrew\":%s,\"initError\":\"%s\","
		"\"audioSettings\":{\"audioRoot\":\"%s\",\"outputRate\":%d,"
		"\"outputBits\":%d,\"outputChannels\":%d,"
		"\"sampleCount2D\":%d,\"sampleCount3D\":%d,\"streamCount\":%d,"
		"\"preferredProvider\":\"%s\",\"preferredSpeaker\":\"%s\"},"
		"\"audioEventInfo\":{\"musicTracks\":%u,\"soundEffects\":%u,"
		"\"streamingEvents\":%u,\"miscAudioParsed\":%s},"
		"\"music\":{\"alreadyLoaded\":%s,\"checkedTrack\":\"%s\","
		"\"checkedFilename\":\"%s\",\"osDisplayWarningPrompts\":%u},"
		"\"volumes\":{\"music\":%.4f,\"sound\":%.4f,"
		"\"sound3D\":%.4f,\"speech\":%.4f},"
		"\"openDevice\":{\"redistDirectorySet\":%s,\"startupCalled\":%s,"
		"\"quickStartupOk\":%s,\"fileCallbacksSet\":%s,"
		"\"outputRate\":%d,\"outputBits\":%d,\"outputChannels\":%d,"
		"\"providerCount\":%u,\"providerSelected\":%s,"
		"\"selectedProvider\":\"%s\",\"selectedProviderOpen\":%s,"
		"\"speakerType\":%d,"
		"\"samples2D\":%u,\"samples3D\":%u,\"streams\":%u,"
		"\"mssSamples2DAllocated\":%u,\"mssSamples3DAllocated\":%u,"
		"\"mssListenersAllocated\":%u},"
		"\"teardown\":{\"tornDown\":%s,\"mssShutdownCalled\":%s,"
		"\"theAudioCleared\":%s}}",
		json_bool(state.attempted),
		json_bool(state.ok),
		source_json.c_str(),
		status_json.c_str(),
		next_required_json.c_str(),
		json_bool(state.would_set_quitting),
		json_bool(state.runtime_archive_registered),
		json_bool(state.startup_singletons_ready),
		json_bool(state.audio_startup_files_ready),
		json_bool(state.memory_manager_ready),
		json_bool(state.global_data_ready),
		json_bool(state.file_system_ready),
		json_bool(state.the_audio_was_null),
		json_bool(state.constructed),
		json_bool(state.the_audio_owned),
		json_bool(state.init_ran),
		json_bool(state.init_threw),
		init_error_json.c_str(),
		audio_root_json.c_str(),
		state.output_rate,
		state.output_bits,
		state.output_channels,
		state.sample_count_2d,
		state.sample_count_3d,
		state.stream_count,
		preferred_provider_json.c_str(),
		preferred_speaker_json.c_str(),
		state.music_track_count,
		state.sound_event_count,
		state.streaming_event_count,
		json_bool(state.misc_audio_parsed),
		json_bool(state.music_already_loaded),
		checked_track_json.c_str(),
		checked_filename_json.c_str(),
		state.os_display_warning_prompts,
		state.music_volume,
		state.sound_volume,
		state.sound3d_volume,
		state.speech_volume,
		json_bool(state.mss_redist_directory_set),
		json_bool(state.mss_startup_called),
		json_bool(state.mss_quick_startup_ok),
		json_bool(state.mss_file_callbacks_set),
		state.mss_output_rate,
		state.mss_output_bits,
		state.mss_output_channels,
		state.provider_count,
		json_bool(state.provider_selected),
		selected_provider_json.c_str(),
		json_bool(state.selected_provider_open),
		state.selected_speaker_type,
		state.num_2d_samples,
		state.num_3d_samples,
		state.num_streams,
		state.mss_2d_samples_allocated,
		state.mss_3d_samples_allocated,
		state.mss_listeners_allocated,
		json_bool(state.torn_down),
		json_bool(state.mss_shutdown_called),
		json_bool(state.the_audio_cleared));
	return json;
}
