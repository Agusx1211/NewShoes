#include <cstdlib>
#include <cstring>
#include <iostream>

#include "Common/AudioAffect.h"
#include "Common/AudioHandleSpecialValues.h"
#include "Common/AudioSettings.h"
#include "Common/GlobalData.h"
#include "GameClient/VideoPlayer.h"
#include "MilesAudioDevice/MilesAudioManager.h"
#include "MSS/MSS.h"

class ControlBar;
class GameClient;
class GameLogic;
class PartitionManager;
class SubsystemInterfaceList;
class TerrainLogic;
class View;

GlobalData *TheWritableGlobalData = nullptr;
VideoPlayerInterface *TheVideoPlayer = nullptr;
SubsystemInterfaceList *TheSubsystemList = nullptr;
GameClient *TheGameClient = nullptr;
GameLogic *TheGameLogic = nullptr;
View *TheTacticalView = nullptr;
TerrainLogic *TheTerrainLogic = nullptr;
ControlBar *TheControlBar = nullptr;
PartitionManager *ThePartitionManager = nullptr;
AudioManager *TheAudio = nullptr;

AudioManager::AudioManager() :
	m_audioSettings(new AudioSettings),
	m_miscAudio(nullptr),
	m_music(nullptr),
	m_sound(nullptr),
	m_listenerPosition(),
	m_listenerOrientation(),
	m_audioRequests(),
	m_musicTracks(),
	m_allAudioEventInfo(),
	theAudioHandlePool(AHSV_FirstHandle),
	m_adjustedVolumes(),
	m_musicVolume(0.0f),
	m_soundVolume(0.0f),
	m_sound3DVolume(0.0f),
	m_speechVolume(0.0f),
	m_scriptMusicVolume(1.0f),
	m_scriptSoundVolume(1.0f),
	m_scriptSound3DVolume(1.0f),
	m_scriptSpeechVolume(1.0f),
	m_systemMusicVolume(1.0f),
	m_systemSoundVolume(1.0f),
	m_systemSound3DVolume(1.0f),
	m_systemSpeechVolume(1.0f),
	m_zoomVolume(1.0f),
	m_silentAudioEvent(nullptr),
	m_savedValues(nullptr),
	m_speechOn(TRUE),
	m_soundOn(TRUE),
	m_sound3DOn(TRUE),
	m_musicOn(TRUE),
	m_volumeHasChanged(FALSE),
	m_hardwareAccel(FALSE),
	m_surroundSpeakers(FALSE),
	m_musicPlayingFromCD(FALSE),
	m_disallowSpeech(FALSE)
{
	m_listenerPosition.zero();
	m_listenerOrientation.set(0.0f, 1.0f, 0.0f);
}

AudioManager::~AudioManager()
{
	delete m_audioSettings;
	m_audioSettings = nullptr;
}

void AudioManager::init() {}
void AudioManager::postProcessLoad() {}
void AudioManager::reset() {}
void AudioManager::update() {}
void AudioManager::loseFocus() {}
void AudioManager::regainFocus() {}
AudioHandle AudioManager::addAudioEvent(const AudioEventRTS *) { return AHSV_NoSound; }
void AudioManager::removeAudioEvent(AudioHandle) {}
Bool AudioManager::isValidAudioEvent(const AudioEventRTS *) const { return FALSE; }
Bool AudioManager::isValidAudioEvent(AudioEventRTS *) const { return FALSE; }
void AudioManager::addTrackName(const AsciiString &) {}
AsciiString AudioManager::nextTrackName(const AsciiString &) { return AsciiString::TheEmptyString; }
AsciiString AudioManager::prevTrackName(const AsciiString &) { return AsciiString::TheEmptyString; }
void AudioManager::setAudioEventEnabled(AsciiString, Bool) {}
void AudioManager::setAudioEventVolumeOverride(AsciiString, Real) {}
void AudioManager::removeAudioEvent(AsciiString) {}
void AudioManager::removeDisabledEvents() {}
void AudioManager::getInfoForAudioEvent(const AudioEventRTS *) const {}
Bool AudioManager::isCurrentlyPlaying(AudioHandle) { return FALSE; }

UnsignedInt AudioManager::translateSpeakerTypeToUnsignedInt(const AsciiString &speakerType)
{
	static const char *speakerTypes[] = {
		"2 Speakers",
		"Headphones",
		"Surround Sound",
		"4 Speaker",
		"5.1 Surround",
		"7.1 Surround",
		nullptr
	};
	for (UnsignedInt i = 0; speakerTypes[i] != nullptr; ++i) {
		if (speakerType == speakerTypes[i]) {
			return i;
		}
	}
	return 0;
}

AsciiString AudioManager::translateUnsignedIntToSpeakerType(UnsignedInt speakerType)
{
	static const char *speakerTypes[] = {
		"2 Speakers",
		"Headphones",
		"Surround Sound",
		"4 Speaker",
		"5.1 Surround",
		"7.1 Surround"
	};
	return AsciiString(speakerType < 6 ? speakerTypes[speakerType] : speakerTypes[0]);
}

Bool AudioManager::isOn(AudioAffect whichToGet) const
{
	if (whichToGet & AudioAffect_Music) {
		return m_musicOn;
	}
	if (whichToGet & AudioAffect_Sound) {
		return m_soundOn;
	}
	if (whichToGet & AudioAffect_Sound3D) {
		return m_sound3DOn;
	}
	return m_speechOn;
}

void AudioManager::setOn(Bool turnOn, AudioAffect whichToAffect)
{
	if (whichToAffect & AudioAffect_Music) {
		m_musicOn = turnOn;
	}
	if (whichToAffect & AudioAffect_Sound) {
		m_soundOn = turnOn;
	}
	if (whichToAffect & AudioAffect_Sound3D) {
		m_sound3DOn = turnOn;
	}
	if (whichToAffect & AudioAffect_Speech) {
		m_speechOn = turnOn;
	}
}

void AudioManager::setVolume(Real volume, AudioAffect whichToAffect)
{
	if (whichToAffect & AudioAffect_Music) {
		m_musicVolume = volume;
	}
	if (whichToAffect & AudioAffect_Sound) {
		m_soundVolume = volume;
	}
	if (whichToAffect & AudioAffect_Sound3D) {
		m_sound3DVolume = volume;
	}
	if (whichToAffect & AudioAffect_Speech) {
		m_speechVolume = volume;
	}
}

Real AudioManager::getVolume(AudioAffect whichToGet)
{
	if (whichToGet & AudioAffect_Music) {
		return m_musicVolume;
	}
	if (whichToGet & AudioAffect_Sound) {
		return m_soundVolume;
	}
	if (whichToGet & AudioAffect_Sound3D) {
		return m_sound3DVolume;
	}
	return m_speechVolume;
}

void AudioManager::set3DVolumeAdjustment(Real volumeAdjustment) { m_zoomVolume = volumeAdjustment; }
void AudioManager::setListenerPosition(const Coord3D *newListenerPos, const Coord3D *newListenerOrientation)
{
	if (newListenerPos != nullptr) {
		m_listenerPosition = *newListenerPos;
	}
	if (newListenerOrientation != nullptr) {
		m_listenerOrientation = *newListenerOrientation;
	}
}
const Coord3D *AudioManager::getListenerPosition() const { return &m_listenerPosition; }
AudioRequest *AudioManager::allocateAudioRequest(Bool) { return nullptr; }
void AudioManager::releaseAudioRequest(AudioRequest *) {}
void AudioManager::appendAudioRequest(AudioRequest *) {}
void AudioManager::processRequestList() {}
AudioEventInfo *AudioManager::newAudioEventInfo(AsciiString) { return nullptr; }
void AudioManager::addAudioEventInfo(AudioEventInfo *) {}
AudioEventInfo *AudioManager::findAudioEventInfo(AsciiString) const { return nullptr; }
const AudioSettings *AudioManager::getAudioSettings() const { return m_audioSettings; }
const MiscAudio *AudioManager::getMiscAudio() const { return m_miscAudio; }
void AudioManager::releaseAudioEventRTS(AudioEventRTS *) {}
AudioSettings *AudioManager::friend_getAudioSettings() { return m_audioSettings; }
MiscAudio *AudioManager::friend_getMiscAudio() { return m_miscAudio; }
const FieldParse *AudioManager::getFieldParseTable() const { return nullptr; }
void AudioManager::refreshCachedVariables()
{
	m_hardwareAccel = FALSE;
	m_surroundSpeakers = FALSE;
}
Real AudioManager::getAudioLengthMS(const AudioEventRTS *) { return 0.0f; }
Bool AudioManager::isMusicAlreadyLoaded() const { return TRUE; }
void AudioManager::findAllAudioEventsOfType(AudioType, std::vector<AudioEventInfo *> &) {}
Bool AudioManager::isCurrentProviderHardwareAccelerated() { return FALSE; }
Bool AudioManager::isCurrentSpeakerTypeSurroundSound() { return FALSE; }
Bool AudioManager::shouldPlayLocally(const AudioEventRTS *) { return FALSE; }
AudioHandle AudioManager::allocateNewHandle() { return theAudioHandlePool++; }
void AudioManager::removeLevelSpecificAudioEventInfos() {}
void AudioManager::removeAllAudioRequests() {}

namespace {

alignas(GlobalData) unsigned char g_global_data_storage[sizeof(GlobalData)] = {};

class SmokeMilesAudioManager : public MilesAudioManager
{
public:
	HPROVIDER delayFilter() const { return m_delayFilter; }
	HPROVIDER selectedProviderHandle() const
	{
		return getSelectedProvider() < m_providerCount ? m_provider3D[getSelectedProvider()].id : 0;
	}
};

void fail(const char *message)
{
	std::cout << "{\"ok\":false,\"failure\":\"" << message << "\"}\n";
	std::exit(1);
}

void require(bool condition, const char *message)
{
	if (!condition) {
		fail(message);
	}
}

UnsignedInt countAllocated2DSamples()
{
	UnsignedInt count = 0;
	const MSSBrowserRuntimeState &runtime = MSSBrowserRuntime();
	for (const MSSBrowserSampleState &sample : runtime.samples) {
		if (sample.allocated && sample.initialized) {
			++count;
		}
	}
	return count;
}

UnsignedInt countAllocated3DSamples()
{
	UnsignedInt count = 0;
	const MSSBrowserRuntimeState &runtime = MSSBrowserRuntime();
	for (const MSSBrowser3DSampleState &sample : runtime.samples3D) {
		if (sample.allocated) {
			++count;
		}
	}
	return count;
}

UnsignedInt countAllocatedListeners()
{
	UnsignedInt count = 0;
	const MSSBrowserRuntimeState &runtime = MSSBrowserRuntime();
	for (const MSSBrowser3DListenerState &listener : runtime.listeners3D) {
		if (listener.allocated) {
			++count;
		}
	}
	return count;
}

void installMinimalGlobalData()
{
	std::memset(g_global_data_storage, 0, sizeof(g_global_data_storage));
	GlobalData *globalData = reinterpret_cast<GlobalData *>(g_global_data_storage);
	globalData->m_audioOn = TRUE;
	TheWritableGlobalData = globalData;
}

void configureMinimalAudioSettings(SmokeMilesAudioManager &audio)
{
	AudioSettings *settings = audio.friend_getAudioSettings();
	settings->m_useDigital = TRUE;
	settings->m_useMidi = FALSE;
	settings->m_outputRate = 44100;
	settings->m_outputBits = 16;
	settings->m_outputChannels = 2;
	settings->m_sampleCount2D = 2;
	settings->m_sampleCount3D = 2;
	settings->m_streamCount = 3;
	settings->m_globalMinRange = 5;
	settings->m_globalMaxRange = 5000;
	settings->m_fadeAudioFrames = 1;
	settings->m_maxCacheSize = 1024 * 1024;
	settings->m_minVolume = 0.0f;
	settings->m_relative2DVolume = 1.0f;
	settings->m_defaultSoundVolume = 1.0f;
	settings->m_default3DSoundVolume = 1.0f;
	settings->m_defaultSpeechVolume = 1.0f;
	settings->m_defaultMusicVolume = 1.0f;
	settings->m_preferredSoundVolume = 1.0f;
	settings->m_preferred3DSoundVolume = 1.0f;
	settings->m_preferredSpeechVolume = 1.0f;
	settings->m_preferredMusicVolume = 1.0f;
	settings->m_defaultSpeakerType2D = audio.translateSpeakerTypeToUnsignedInt("2 Speakers");
	settings->m_defaultSpeakerType3D = audio.translateSpeakerTypeToUnsignedInt("2 Speakers");
	settings->m_preferred3DProvider[MAX_HW_PROVIDERS] = "Miles Fast 2D Positional Audio";

	audio.setPreferredProvider("Miles Fast 2D Positional Audio");
	audio.setPreferredSpeaker("2 Speakers");
}

}

int main()
{
	MSSBrowserRuntimeReset();
	installMinimalGlobalData();

	{
		SmokeMilesAudioManager audio;
		TheAudio = &audio;
		configureMinimalAudioSettings(audio);

		audio.openDevice();

		const MSSBrowserRuntimeState &runtime = MSSBrowserRuntime();
		const HPROVIDER selectedProvider = audio.selectedProviderHandle();
		require(runtime.redist_directory_set, "redist directory was not configured");
		require(runtime.startup_called, "AIL_startup was not called");
		require(runtime.quick_startup_called, "AIL_quick_startup was not called");
		require(runtime.quick_startup_ok, "AIL_quick_startup did not accept the smoke settings");
		require(runtime.use_digital == TRUE, "digital output was not requested");
		require(runtime.use_midi == FALSE, "midi output should stay disabled");
		require(runtime.output_rate == 44100, "unexpected output rate");
		require(runtime.output_bits == 16, "unexpected output bit depth");
		require(runtime.output_channels == 2, "unexpected output channel count");
		require(audio.getProviderCount() >= 2, "MSS provider enumeration did not reach the manager");
		require(audio.getProviderName(0) == "Miles Fast 2D Positional Audio", "first provider name mismatch");
		require(audio.getSelectedProvider() != PROVIDER_ERROR, "original manager did not select a provider");
		require(selectedProvider > 0, "selected provider handle was not exposed");
		require(runtime.provider_open[selectedProvider], "selected provider was not opened in MSS");
		require(runtime.provider_speaker_type[selectedProvider] == static_cast<S32>(audio.getSpeakerType()),
			"speaker type was not applied to the selected provider");
		require(audio.getNum2DSamples() == 2, "manager 2D sample count mismatch");
		require(audio.getNum3DSamples() == 2, "manager 3D sample count mismatch");
		require(audio.getNumStreams() == 3, "manager stream count mismatch");
		require(countAllocated2DSamples() == 2, "MSS 2D sample pool mismatch");
		require(countAllocated3DSamples() == 2, "MSS 3D sample pool mismatch");
		require(countAllocatedListeners() == 1, "MSS listener allocation mismatch");
		require(audio.delayFilter() == 0x6001, "Mono Delay Filter was not selected");

		std::cout
			<< "{\"ok\":true"
			<< ",\"path\":\"MilesAudioManager::openDevice\""
			<< ",\"provider\":\"" << audio.getProviderName(audio.getSelectedProvider()).str() << "\""
			<< ",\"providerHandle\":" << selectedProvider
			<< ",\"samples2D\":" << audio.getNum2DSamples()
			<< ",\"samples3D\":" << audio.getNum3DSamples()
			<< ",\"streams\":" << audio.getNumStreams()
			<< ",\"delayFilter\":" << audio.delayFilter()
			<< ",\"globalData\":\"raw m_audioOn only\""
			<< "}\n";
	}

	TheWritableGlobalData = nullptr;
	return 0;
}
