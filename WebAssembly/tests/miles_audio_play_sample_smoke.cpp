#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#ifdef NULL
#undef NULL
#endif
#define NULL 0

#include "Common/ArchiveFileSystem.h"
#include "Common/AudioAffect.h"
#include "Common/AudioEventInfo.h"
#include "Common/AudioEventRTS.h"
#include "Common/AudioHandleSpecialValues.h"
#include "Common/AudioRequest.h"
#include "Common/AudioSettings.h"
#include "Common/File.h"
#include "Common/FileSystem.h"
#include "Common/GameSounds.h"
#include "Common/GlobalData.h"
#include "Common/LocalFileSystem.h"
#include "Common/NameKeyGenerator.h"
#include "GameClient/VideoPlayer.h"
#include "MilesAudioDevice/MilesAudioManager.h"
#include "MSS/MSS.h"

class ControlBar;
class GameClient;
class GameLogic;
class PartitionManager;
class PlayerList;
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
PlayerList *ThePlayerList = nullptr;
AudioManager *TheAudio = nullptr;

namespace {

alignas(GlobalData) unsigned char g_global_data_storage[sizeof(GlobalData)] = {};
UnsignedInt g_audio_event_release_count = 0;

constexpr const char *kEventName = "PortSmoke2D";
constexpr const char *kSoundBaseName = "PortSmoke";
constexpr const char *kSoundPath = "Data\\Audio\\Sounds\\PortSmoke.wav";
constexpr const char *kAdpcmEventName = "PortSmokeADPCM2D";
constexpr const char *kAdpcmSoundBaseName = "PortSmokeADPCM";
constexpr const char *kAdpcmSoundPath = "Data\\Audio\\Sounds\\PortSmokeADPCM.wav";
constexpr const char *kAllEventName = "PortSmokeAll2D";
constexpr const char *kAllSoundBaseName1 = "PortSmokeAll1";
constexpr const char *kAllSoundBaseName2 = "PortSmokeAll2";
constexpr const char *kAllSoundBaseName3 = "PortSmokeAll3";
constexpr const char *kAllSoundPath1 = "Data\\Audio\\Sounds\\PortSmokeAll1.wav";
constexpr const char *kAllSoundPath2 = "Data\\Audio\\Sounds\\PortSmokeAll2.wav";
constexpr const char *kAllSoundPath3 = "Data\\Audio\\Sounds\\PortSmokeAll3.wav";
constexpr U32 kSampleRate = 44100;
constexpr U32 kChannels = 2;
constexpr U32 kBitsPerSample = 16;
constexpr U32 kFrames = 2205;

struct SmokeFileEntry
{
	std::string name;
	std::vector<char> payload;
};

class SmokeFile : public File
{
public:
	SmokeFile() : m_position(0) {}

	void setPayload(const std::vector<char> &payload)
	{
		m_data = payload;
		m_position = 0;
	}

	Int read(void *buffer, Int bytes) override
	{
		if (buffer == nullptr || bytes <= 0) {
			return 0;
		}
		const Int remaining = static_cast<Int>(m_data.size()) - m_position;
		const Int bytes_to_read = remaining <= 0 ? 0 : (bytes < remaining ? bytes : remaining);
		if (bytes_to_read > 0) {
			std::memcpy(buffer, m_data.data() + m_position, static_cast<std::size_t>(bytes_to_read));
			m_position += bytes_to_read;
		}
		return bytes_to_read;
	}

	Int write(const void *, Int) override { return -1; }

	Int seek(Int bytes, seekMode mode = CURRENT) override
	{
		Int base = 0;
		if (mode == CURRENT) {
			base = m_position;
		} else if (mode == END) {
			base = static_cast<Int>(m_data.size());
		}

		const Int limit = static_cast<Int>(m_data.size());
		const Int next = base + bytes;
		m_position = next < 0 ? 0 : (next > limit ? limit : next);
		return m_position;
	}

	void nextLine(Char *buf = nullptr, Int bufSize = 0) override
	{
		if (buf != nullptr && bufSize > 0) {
			buf[0] = 0;
		}
	}

	Bool scanInt(Int &) override { return FALSE; }
	Bool scanReal(Real &) override { return FALSE; }
	Bool scanString(AsciiString &) override { return FALSE; }

	char *readEntireAndClose() override
	{
		char *buffer = NEW char[m_data.size() + 1];
		if (buffer != nullptr) {
			std::memcpy(buffer, m_data.data(), m_data.size());
			buffer[m_data.size()] = 0;
		}
		close();
		return buffer;
	}

	File *convertToRAMFile() override { return this; }

private:
	std::vector<char> m_data;
	Int m_position;
};

class SmokeLocalFileSystem : public LocalFileSystem
{
public:
	void addFile(const char *filename, const std::vector<char> &payload)
	{
		m_entries.push_back({ filename != nullptr ? filename : "", payload });
	}

	void init() override {}
	void reset() override {}
	void update() override {}

	File *openFile(const Char *filename, Int access = 0) override
	{
		const SmokeFileEntry *entry = findEntry(filename);
		if (entry == nullptr) {
			return nullptr;
		}

		m_file.close();
		m_file.setPayload(entry->payload);
		return m_file.open(filename, access) ? &m_file : nullptr;
	}

	Bool doesFileExist(const Char *filename) const override
	{
		return findEntry(filename) != nullptr;
	}

	void getFileListInDirectory(
		const AsciiString &,
		const AsciiString &,
		const AsciiString &,
		FilenameList &,
		Bool) const override {}

	Bool getFileInfo(const AsciiString &, FileInfo *) const override { return FALSE; }
	Bool createDirectory(AsciiString) override { return FALSE; }

private:
	const SmokeFileEntry *findEntry(const Char *filename) const
	{
		if (filename == nullptr) {
			return nullptr;
		}
		for (const SmokeFileEntry &entry : m_entries) {
			if (entry.name == filename) {
				return &entry;
			}
		}
		return nullptr;
	}

	std::vector<SmokeFileEntry> m_entries;
	SmokeFile m_file;
};

class SmokeArchiveFileSystem : public ArchiveFileSystem
{
public:
	void init() override {}
	void update() override {}
	void reset() override {}
	void postProcessLoad() override {}
	ArchiveFile *openArchiveFile(const Char *) override { return nullptr; }
	void closeArchiveFile(const Char *) override {}
	void closeAllArchiveFiles() override {}
	void closeAllFiles() override {}
	Bool loadBigFilesFromDirectory(AsciiString, AsciiString, Bool = FALSE) override { return FALSE; }
};

class SmokeSoundManager : public SoundManager
{
public:
	UnsignedInt playing2D() const { return m_numPlaying2DSamples; }
};

class SmokeMilesAudioManager : public MilesAudioManager
{
public:
	using MilesAudioManager::processPlayingList;
	using MilesAudioManager::processRequest;
	using MilesAudioManager::stopAllAudioImmediately;
	using MilesAudioManager::stopAllSpeech;

	void installSoundManager(SoundManager *sound) { m_sound = sound; }
	UnsignedInt available2DSampleCount() const { return static_cast<UnsignedInt>(m_availableSamples.size()); }
	UnsignedInt playingSoundCount() const { return static_cast<UnsignedInt>(m_playingSounds.size()); }
	AsciiString playingFilename() const
	{
		return m_playingSounds.empty()
			? AsciiString::TheEmptyString
			: m_playingSounds.front()->m_audioEventRTS->getFilename();
	}
	void addNullEntriesToAllPlayingLists()
	{
		m_playingSounds.push_back(nullptr);
		m_playing3DSounds.push_back(nullptr);
		m_playingStreams.push_back(nullptr);
		m_fadingAudio.push_back(nullptr);
	}
	void addNullStreamEntry() { m_playingStreams.push_back(nullptr); }
	void addNullFadingEntry() { m_fadingAudio.push_back(nullptr); }
	void addNullSampleEntries()
	{
		m_playingSounds.push_back(nullptr);
		m_playing3DSounds.push_back(nullptr);
	}
	Bool allPlayingListsEmpty() const
	{
		return m_playingSounds.empty() &&
			m_playing3DSounds.empty() &&
			m_playingStreams.empty() &&
			m_fadingAudio.empty();
	}
	HSAMPLE playingSampleHandle() const
	{
		return m_playingSounds.empty() ? 0 : m_playingSounds.front()->m_sample;
	}
};

struct StackAudioEventInfo : public AudioEventInfo
{
public:
	~StackAudioEventInfo() override {}
};

struct StackAudioRequest : public AudioRequest
{
public:
	~StackAudioRequest() override {}
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

void writeJsonString(std::ostream &out, const char *text)
{
	out << "\"";
	for (const char *cursor = text != nullptr ? text : ""; *cursor != '\0'; ++cursor) {
		switch (*cursor) {
			case '\\':
				out << "\\\\";
				break;
			case '"':
				out << "\\\"";
				break;
			case '\n':
				out << "\\n";
				break;
			case '\r':
				out << "\\r";
				break;
			case '\t':
				out << "\\t";
				break;
			default:
				out << *cursor;
				break;
		}
	}
	out << "\"";
}

void writeU16LE(std::vector<char> &data, std::size_t offset, U16 value)
{
	data[offset] = static_cast<char>(value & 0xff);
	data[offset + 1] = static_cast<char>((value >> 8) & 0xff);
}

void writeU32LE(std::vector<char> &data, std::size_t offset, U32 value)
{
	data[offset] = static_cast<char>(value & 0xff);
	data[offset + 1] = static_cast<char>((value >> 8) & 0xff);
	data[offset + 2] = static_cast<char>((value >> 16) & 0xff);
	data[offset + 3] = static_cast<char>((value >> 24) & 0xff);
}

std::vector<char> makePcmWave()
{
	const U32 bytes_per_sample = kBitsPerSample / 8;
	const U32 data_bytes = kFrames * kChannels * bytes_per_sample;
	std::vector<char> wave(44 + data_bytes, 0);

	std::memcpy(wave.data() + 0, "RIFF", 4);
	writeU32LE(wave, 4, 36 + data_bytes);
	std::memcpy(wave.data() + 8, "WAVE", 4);
	std::memcpy(wave.data() + 12, "fmt ", 4);
	writeU32LE(wave, 16, 16);
	writeU16LE(wave, 20, WAVE_FORMAT_PCM);
	writeU16LE(wave, 22, kChannels);
	writeU32LE(wave, 24, kSampleRate);
	writeU32LE(wave, 28, kSampleRate * kChannels * bytes_per_sample);
	writeU16LE(wave, 32, kChannels * bytes_per_sample);
	writeU16LE(wave, 34, kBitsPerSample);
	std::memcpy(wave.data() + 36, "data", 4);
	writeU32LE(wave, 40, data_bytes);

	std::size_t cursor = 44;
	for (U32 frame = 0; frame < kFrames; ++frame) {
		const S16 sample = (frame % 80) < 40 ? 12000 : -12000;
		for (U32 channel = 0; channel < kChannels; ++channel) {
			writeU16LE(wave, cursor, static_cast<U16>(sample));
			cursor += 2;
		}
	}

	return wave;
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
	settings->m_audioRoot = "Data\\Audio";
	settings->m_soundsFolder = "Sounds";
	settings->m_musicFolder = "Music";
	settings->m_streamingFolder = "Speech";
	settings->m_soundsExtension = "wav";
	settings->m_useDigital = TRUE;
	settings->m_useMidi = FALSE;
	settings->m_outputRate = kSampleRate;
	settings->m_outputBits = kBitsPerSample;
	settings->m_outputChannels = kChannels;
	settings->m_sampleCount2D = 2;
	settings->m_sampleCount3D = 1;
	settings->m_streamCount = 1;
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
	audio.setVolume(1.0f, AudioAffect_Sound);
	audio.setVolume(1.0f, AudioAffect_Sound3D);
}

// emcc 3.1.6 in this environment does not wire `main(int, char **)` into the
// generated runtime (callMain is omitted), so command-line options are read
// from process.argv via the JS bridge instead.
bool getNodeArgument(const char *flag, char *out, int outSize)
{
#ifdef __EMSCRIPTEN__
	return EM_ASM_INT({
		try {
			const flag = UTF8ToString($0);
			const argv = typeof process !== "undefined" ? process.argv : [];
			const index = argv.indexOf(flag);
			if (index < 0 || index + 1 >= argv.length) {
				return 0;
			}
			stringToUTF8(argv[index + 1], $1, $2);
			return 1;
		} catch (error) {
			return 0;
		}
	}, flag, out, outSize) != 0;
#else
	(void)flag;
	(void)out;
	(void)outSize;
	return false;
#endif
}

std::vector<char> readFileBytes(const char *path)
{
	std::vector<char> bytes;
	std::FILE *file = fopen(path, "rb");
	if (file == nullptr) {
		return bytes;
	}
	if (std::fseek(file, 0, SEEK_END) == 0) {
		const long size = std::ftell(file);
		if (size > 0 && std::fseek(file, 0, SEEK_SET) == 0) {
			bytes.resize(static_cast<std::size_t>(size));
			if (std::fread(bytes.data(), 1, bytes.size(), file) != bytes.size()) {
				bytes.clear();
			}
		}
	}
	std::fclose(file);
	return bytes;
}

bool writeFileBytes(const char *path, const void *data, std::size_t size)
{
	std::FILE *file = fopen(path, "wb");
	if (file == nullptr) {
		return false;
	}
	const bool ok = std::fwrite(data, 1, size, file) == size;
	std::fclose(file);
	return ok;
}

void configureAudioEventInfo(AudioEventInfo &info)
{
	info.m_audioName = kEventName;
	info.m_filename.clear();
	info.m_volume = 0.5f;
	info.m_volumeShift = 0.0f;
	info.m_minVolume = 0.0f;
	info.m_pitchShiftMin = 1.0f;
	info.m_pitchShiftMax = 1.0f;
	info.m_delayMin = 0;
	info.m_delayMax = 0;
	info.m_limit = 1;
	info.m_loopCount = 1;
	info.m_priority = AP_NORMAL;
	info.m_type = ST_UI;
	info.m_control = 0;
	info.m_soundsMorning.clear();
	info.m_sounds.clear();
	info.m_sounds.push_back(kSoundBaseName);
	info.m_soundsNight.clear();
	info.m_soundsEvening.clear();
	info.m_attackSounds.clear();
	info.m_decaySounds.clear();
	info.m_lowPassFreq = 0.0f;
	info.m_minDistance = 0.0f;
	info.m_maxDistance = 0.0f;
	info.m_soundType = AT_SoundEffect;
}

} // namespace

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
void AudioManager::releaseAudioEventRTS(AudioEventRTS *) { ++g_audio_event_release_count; }
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

SoundManager::SoundManager() :
	m_num2DSamples(0),
	m_num3DSamples(0),
	m_numPlaying2DSamples(0),
	m_numPlaying3DSamples(0)
{
}

SoundManager::~SoundManager() {}
void SoundManager::init() {}
void SoundManager::postProcessLoad() {}
void SoundManager::update() {}
void SoundManager::reset()
{
	m_numPlaying2DSamples = 0;
	m_numPlaying3DSamples = 0;
}
void SoundManager::loseFocus() {}
void SoundManager::regainFocus() {}
void SoundManager::setListenerPosition(const Coord3D *) {}
void SoundManager::setViewRadius(Real) {}
void SoundManager::setCameraAudibleDistance(Real) {}
Real SoundManager::getCameraAudibleDistance() { return 1.0f; }
void SoundManager::addAudioEvent(AudioEventRTS *) {}
void SoundManager::notifyOf2DSampleStart() { ++m_numPlaying2DSamples; }
void SoundManager::notifyOf3DSampleStart() { ++m_numPlaying3DSamples; }
void SoundManager::notifyOf2DSampleCompletion()
{
	if (m_numPlaying2DSamples > 0) {
		--m_numPlaying2DSamples;
	}
}
void SoundManager::notifyOf3DSampleCompletion()
{
	if (m_numPlaying3DSamples > 0) {
		--m_numPlaying3DSamples;
	}
}
Int SoundManager::getAvailableSamples()
{
	return static_cast<Int>(m_num2DSamples - m_numPlaying2DSamples);
}
Int SoundManager::getAvailable3DSamples()
{
	return static_cast<Int>(m_num3DSamples - m_numPlaying3DSamples);
}
AsciiString SoundManager::getFilenameForPlayFromAudioEvent(const AudioEventRTS *)
{
	return AsciiString::TheEmptyString;
}
Bool SoundManager::canPlayNow(AudioEventRTS *) { return TRUE; }
Bool SoundManager::violatesVoice(AudioEventRTS *) { return FALSE; }
Bool SoundManager::isInterrupting(AudioEventRTS *) { return FALSE; }

int main()
{
	static char adpcm_input_buffer[1024] = {};
	static char adpcm_dump_buffer[1024] = {};
	const char *adpcm_input_path =
		getNodeArgument("--adpcm", adpcm_input_buffer, sizeof(adpcm_input_buffer))
			? adpcm_input_buffer
			: nullptr;
	const char *adpcm_dump_path =
		getNodeArgument("--adpcm-dump", adpcm_dump_buffer, sizeof(adpcm_dump_buffer))
			? adpcm_dump_buffer
			: nullptr;

	MSSBrowserRuntimeReset();
	installMinimalGlobalData();
	g_audio_event_release_count = 0;

	FileSystem file_system;
	SmokeLocalFileSystem local_file_system;
	SmokeArchiveFileSystem archive_file_system;
	NameKeyGenerator name_key_generator;
	const std::vector<char> wave = makePcmWave();
	local_file_system.addFile(kSoundPath, wave);
	local_file_system.addFile(kAllSoundPath1, wave);
	local_file_system.addFile(kAllSoundPath2, wave);
	local_file_system.addFile(kAllSoundPath3, wave);

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	AudioManager *old_audio = TheAudio;

	TheFileSystem = &file_system;
	TheLocalFileSystem = &local_file_system;
	TheArchiveFileSystem = &archive_file_system;
	TheNameKeyGenerator = &name_key_generator;

	{
		StackAudioEventInfo info;
		configureAudioEventInfo(info);
		AudioEventRTS event(kEventName);

		SmokeSoundManager sound;
		SmokeMilesAudioManager audio;
		TheAudio = &audio;
		audio.installSoundManager(&sound);
		configureMinimalAudioSettings(audio);

		audio.init();
		require(audio.getNum2DSamples() == 2, "manager did not allocate the expected 2D sample pool");
		require(audio.available2DSampleCount() == 2, "2D sample pool did not start fully available");

		event.setAudioEventInfo(&info);
		event.generateFilename();
		event.generatePlayInfo();
		event.setPlayingHandle(AHSV_FirstHandle);
		require(event.getFilename() == kSoundPath, "event did not resolve through the original filename path");

		StackAudioRequest request;
		request.m_request = AR_Play;
		request.m_pendingEvent = &event;
		request.m_usePendingEvent = TRUE;
		request.m_requiresCheckForSample = FALSE;

		audio.processRequest(&request);

		const HSAMPLE sample = audio.playingSampleHandle();
		const MSSBrowserSampleState *sample_state = MSSBrowserFindSample(sample);
		require(sample != 0, "original playAudioEvent did not attach a 2D sample handle");
		require(sample_state != nullptr, "MSS runtime did not retain the sample state");
		require(sample_state->initialized, "playSample did not initialize the sample");
		require(sample_state->file_set, "playSample did not load file data into the sample");
		require(sample_state->started, "playSample did not start the sample");
		require(sample_state->status == SMP_PLAYING, "sample did not enter SMP_PLAYING");
		require(sample_state->file_data != nullptr, "AudioFileCache did not provide sample bytes");
		require(sample_state->volume_float > 0.499f && sample_state->volume_float < 0.501f,
			"sample volume did not come from AudioEventRTS and AudioManager sound volume");
		require(sample_state->pan_float > 0.499f && sample_state->pan_float < 0.501f,
			"sample pan did not stay centered");
		require(sample_state->playback_rate == static_cast<S32>(kSampleRate),
			"sample playback rate changed unexpectedly");
		require(audio.playingSoundCount() == 1, "manager did not track one playing 2D sound");
		require(audio.available2DSampleCount() == 1, "manager did not consume one available 2D sample");
		require(sound.playing2D() == 1, "SoundManager did not observe the 2D sample start");

		AILSOUNDINFO parsed_info = {};
		require(AIL_WAV_info(static_cast<U8 *>(sample_state->file_data), &parsed_info) == 1,
			"AIL_WAV_info did not parse the AudioFileCache payload");
		require(parsed_info.format == WAVE_FORMAT_PCM, "parsed WAV format mismatch");
		require(parsed_info.channels == static_cast<S32>(kChannels), "parsed WAV channel count mismatch");
		require(parsed_info.rate == kSampleRate, "parsed WAV sample rate mismatch");
		require(parsed_info.bits == static_cast<S32>(kBitsPerSample), "parsed WAV bit depth mismatch");
		require(parsed_info.data_ptr != nullptr && parsed_info.data_len == kFrames * kChannels * 2,
			"parsed WAV data chunk mismatch");
		require(parsed_info.samples == kFrames, "parsed WAV frame count mismatch");

		AIL_end_sample(sample);
		require(sample_state->status == SMP_DONE, "AIL_end_sample did not mark the sample done");
		audio.processPlayingList();

		require(audio.playingSoundCount() == 0, "processPlayingList did not release the stopped sample");
		require(audio.available2DSampleCount() == 2, "released sample did not return to the 2D pool");
		require(sound.playing2D() == 0, "SoundManager did not observe the 2D sample completion");
		require(g_audio_event_release_count == 1, "releasePlayingAudio did not release the AudioEventRTS");

		audio.addNullEntriesToAllPlayingLists();
		audio.stopAllAudioImmediately();
		require(audio.allPlayingListsEmpty(),
			"stopAllAudioImmediately did not remove null playing entries");

		audio.addNullStreamEntry();
		audio.stopAllSpeech();
		require(audio.allPlayingListsEmpty(),
			"stopAllSpeech did not remove a null stream entry");

		audio.addNullFadingEntry();
		audio.processFadingList();
		require(audio.allPlayingListsEmpty(),
			"processFadingList did not remove a null fading entry");

		audio.addNullSampleEntries();
		audio.closeAnySamplesUsingFile(&audio);
		require(audio.allPlayingListsEmpty(),
			"closeAnySamplesUsingFile did not remove null sample entries");

		// Optional second leg: play a real shipped IMA ADPCM WAV through the
		// original AudioFileCache::openFile decode branch so the Miles
		// boundary (AIL_WAV_info -> AIL_decompress_ADPCM) runs on real data.
		std::string adpcmJson = "null";
		if (adpcm_input_path != nullptr) {
			std::vector<char> adpcmWave = readFileBytes(adpcm_input_path);
			require(!adpcmWave.empty(), "could not read the real IMA ADPCM payload");
			local_file_system.addFile(kAdpcmSoundPath, adpcmWave);

			AILSOUNDINFO sourceInfo = {};
			require(AIL_WAV_info(adpcmWave.data(), &sourceInfo) == 1,
				"AIL_WAV_info did not parse the real ADPCM payload");
			require(sourceInfo.format == WAVE_FORMAT_IMA_ADPCM, "real payload is not IMA ADPCM");
			require(sourceInfo.samples > 0, "real ADPCM payload has no frame count");
			require(sourceInfo.block_size > 0, "real ADPCM payload has no block alignment");

			StackAudioEventInfo adpcmInfo;
			configureAudioEventInfo(adpcmInfo);
			adpcmInfo.m_audioName = kAdpcmEventName;
			adpcmInfo.m_sounds.clear();
			adpcmInfo.m_sounds.push_back(kAdpcmSoundBaseName);

			AudioEventRTS adpcmEvent(kAdpcmEventName);
			adpcmEvent.setAudioEventInfo(&adpcmInfo);
			adpcmEvent.generateFilename();
			adpcmEvent.generatePlayInfo();
			adpcmEvent.setPlayingHandle(AHSV_FirstHandle + 1);
			require(adpcmEvent.getFilename() == kAdpcmSoundPath,
				"ADPCM event did not resolve through the original filename path");

			StackAudioRequest adpcmRequest;
			adpcmRequest.m_request = AR_Play;
			adpcmRequest.m_pendingEvent = &adpcmEvent;
			adpcmRequest.m_usePendingEvent = TRUE;
			adpcmRequest.m_requiresCheckForSample = FALSE;

			audio.processRequest(&adpcmRequest);

			const HSAMPLE adpcmSample = audio.playingSampleHandle();
			const MSSBrowserSampleState *adpcm_state = MSSBrowserFindSample(adpcmSample);
			require(adpcmSample != 0, "ADPCM playAudioEvent did not attach a 2D sample handle");
			require(adpcm_state != nullptr, "MSS runtime did not retain the ADPCM sample state");
			require(adpcm_state->file_set && adpcm_state->status == SMP_PLAYING,
				"ADPCM sample did not start playing");
			require(adpcm_state->file_data != nullptr,
				"AudioFileCache did not provide decoded ADPCM bytes");

			AILSOUNDINFO decodedInfo = {};
			require(AIL_WAV_info(static_cast<U8 *>(adpcm_state->file_data), &decodedInfo) == 1,
				"AIL_WAV_info did not parse the decoded buffer");
			require(decodedInfo.format == WAVE_FORMAT_PCM,
				"AIL_decompress_ADPCM did not produce a PCM WAV");
			require(decodedInfo.bits == 16, "decoded WAV is not 16-bit PCM");
			require(decodedInfo.channels == sourceInfo.channels, "decoded channel count mismatch");
			require(decodedInfo.rate == sourceInfo.rate, "decoded sample rate mismatch");
			require(decodedInfo.samples == sourceInfo.samples,
				"decoded frame count does not match the source frame count");
			const U32 expectedDataBytes =
				sourceInfo.samples * static_cast<U32>(sourceInfo.channels) * 2u;
			require(decodedInfo.data_len == expectedDataBytes,
				"decoded PCM size does not match samples*channels*2");

			const U8 *decodedWave = static_cast<const U8 *>(adpcm_state->file_data);
			const U32 decodedWaveBytes = 8u + MSSReadU32LE(decodedWave + 4);
			require(decodedWaveBytes == 44u + expectedDataBytes, "decoded WAV image size mismatch");

			const S16 *decodedSamples = static_cast<const S16 *>(decodedInfo.data_ptr);
			U32 nonZeroSamples = 0;
			S32 maxAbsSample = 0;
			for (U32 i = 0; i < expectedDataBytes / 2; ++i) {
				const S32 value = decodedSamples[i];
				if (value != 0) {
					++nonZeroSamples;
				}
				const S32 magnitude = value < 0 ? -value : value;
				if (magnitude > maxAbsSample) {
					maxAbsSample = magnitude;
				}
			}
			require(nonZeroSamples > 0, "decoded ADPCM PCM is silent");

			if (adpcm_dump_path != nullptr) {
				require(writeFileBytes(adpcm_dump_path, decodedWave, decodedWaveBytes),
					"could not dump the decoded PCM WAV");
			}

			AIL_end_sample(adpcmSample);
			audio.processPlayingList();
			require(audio.playingSoundCount() == 0,
				"processPlayingList did not release the stopped ADPCM sample");
			require(audio.available2DSampleCount() == 2,
				"released ADPCM sample did not return to the 2D pool");
			require(g_audio_event_release_count == 2,
				"releasePlayingAudio did not release the ADPCM AudioEventRTS");

			std::ostringstream adpcmOut;
			adpcmOut << "{\"input\":";
			writeJsonString(adpcmOut, adpcm_input_path);
			adpcmOut
				<< ",\"filename\":";
			writeJsonString(adpcmOut, adpcmEvent.getFilename().str());
			adpcmOut
				<< ",\"source\":{\"format\":" << sourceInfo.format
				<< ",\"channels\":" << sourceInfo.channels
				<< ",\"rate\":" << sourceInfo.rate
				<< ",\"blockSize\":" << sourceInfo.block_size
				<< ",\"dataBytes\":" << sourceInfo.data_len
				<< ",\"frames\":" << sourceInfo.samples
				<< ",\"bytes\":" << adpcmWave.size()
				<< "}"
				<< ",\"decoded\":{\"format\":" << decodedInfo.format
				<< ",\"bits\":" << decodedInfo.bits
				<< ",\"channels\":" << decodedInfo.channels
				<< ",\"rate\":" << decodedInfo.rate
				<< ",\"frames\":" << decodedInfo.samples
				<< ",\"dataBytes\":" << decodedInfo.data_len
				<< ",\"expectedDataBytes\":" << expectedDataBytes
				<< ",\"waveBytes\":" << decodedWaveBytes
				<< ",\"nonZeroSamples\":" << nonZeroSamples
				<< ",\"maxAbsSample\":" << maxAbsSample
				<< ",\"dumped\":" << (adpcm_dump_path != nullptr ? "true" : "false")
				<< "}"
				<< ",\"sample\":{\"handle\":" << adpcmSample
				<< ",\"statusAfterStart\":" << SMP_PLAYING
				<< ",\"statusAfterEnd\":" << SMP_DONE
				<< "}"
				<< "}";
			adpcmJson = adpcmOut.str();
		}

		const UnsignedInt releasesBeforeAll = g_audio_event_release_count;
		StackAudioEventInfo allInfo;
		configureAudioEventInfo(allInfo);
		allInfo.m_audioName = kAllEventName;
		allInfo.m_control = AC_ALL;
		allInfo.m_sounds.clear();
		allInfo.m_sounds.push_back(kAllSoundBaseName1);
		allInfo.m_sounds.push_back(kAllSoundBaseName2);
		allInfo.m_sounds.push_back(kAllSoundBaseName3);

		AudioEventRTS allEvent(kAllEventName);
		allEvent.setAudioEventInfo(&allInfo);
		allEvent.generateFilename();
		allEvent.generatePlayInfo();
		allEvent.setPlayingHandle(AHSV_FirstHandle + 2);

		StackAudioRequest allRequest;
		allRequest.m_request = AR_Play;
		allRequest.m_pendingEvent = &allEvent;
		allRequest.m_usePendingEvent = TRUE;
		allRequest.m_requiresCheckForSample = FALSE;
		audio.processRequest(&allRequest);

		const HSAMPLE allSample = audio.playingSampleHandle();
		const MSSBrowserSampleState *allSampleState = MSSBrowserFindSample(allSample);
		require(allSample != 0 && allSampleState != nullptr,
			"AC_ALL event did not start its first sample");
		require(audio.playingFilename() == kAllSoundPath1,
			"AC_ALL event did not start with its first filename");

		AIL_end_sample(allSample);
		require(allSampleState->status == SMP_PLAYING,
			"AC_ALL event stopped after its first sample");
		require(audio.playingFilename() == kAllSoundPath2,
			"AC_ALL event did not advance to its second filename");

		AIL_end_sample(allSample);
		require(allSampleState->status == SMP_PLAYING,
			"AC_ALL event stopped after its second sample");
		require(audio.playingFilename() == kAllSoundPath3,
			"AC_ALL event did not advance to its third filename");

		AIL_end_sample(allSample);
		require(allSampleState->status == SMP_DONE,
			"AC_ALL event did not finish after its final sample");
		audio.processPlayingList();
		require(audio.playingSoundCount() == 0,
			"completed AC_ALL event remained in the playing list");
		require(g_audio_event_release_count == releasesBeforeAll + 1,
			"completed AC_ALL event did not release its AudioEventRTS");

		std::cout
			<< "{\"ok\":true"
			<< ",\"path\":\"MilesAudioManager::processRequest->playAudioEvent->playSample\""
			<< ",\"request\":\"AR_Play\""
			<< ",\"event\":\"" << kEventName << "\""
			<< ",\"filename\":";
		writeJsonString(std::cout, event.getFilename().str());
		std::cout
			<< ",\"sample\":{\"handle\":" << sample
			<< ",\"statusAfterStart\":" << SMP_PLAYING
			<< ",\"statusAfterEnd\":" << SMP_DONE
			<< ",\"volume\":" << sample_state->volume_float
			<< ",\"pan\":" << sample_state->pan_float
			<< ",\"browserPlaybackRequested\":" << (sample_state->browser_playback_requested ? "true" : "false")
			<< "}"
			<< ",\"wav\":{\"format\":\"PCM\",\"rate\":" << parsed_info.rate
			<< ",\"channels\":" << parsed_info.channels
			<< ",\"bits\":" << parsed_info.bits
			<< ",\"bytes\":" << wave.size()
			<< "}"
			<< ",\"manager\":{\"samples2D\":" << audio.getNum2DSamples()
			<< ",\"available2DAfterRelease\":" << audio.available2DSampleCount()
			<< ",\"playingSoundsAfterRelease\":" << audio.playingSoundCount()
			<< ",\"nullCleanup\":true"
			<< ",\"audioEventReleases\":" << g_audio_event_release_count
			<< "}"
			<< ",\"allSequence\":[";
		writeJsonString(std::cout, kAllSoundPath1);
		std::cout << ',';
		writeJsonString(std::cout, kAllSoundPath2);
		std::cout << ',';
		writeJsonString(std::cout, kAllSoundPath3);
		std::cout
			<< "]"
			<< ",\"adpcm\":" << adpcmJson
			<< "}\n";
	}

	TheFileSystem = old_file_system;
	TheLocalFileSystem = old_local_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheNameKeyGenerator = old_name_key_generator;
	TheAudio = old_audio;
	TheWritableGlobalData = nullptr;
	return 0;
}
