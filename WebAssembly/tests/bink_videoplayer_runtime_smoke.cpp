#include "PreRTS.h"

#include <cstdio>
#include <cstdlib>
#include <vector>

#include "Common/AsciiString.h"
#include "Common/AudioAffect.h"
#include "Common/GameAudio.h"
#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/SubsystemInterface.h"
#include "GameClient/VideoPlayer.h"
#include "VideoDevice/Bink/BinkVideoPlayer.h"
#include "bink.h"

SubsystemInterfaceList *TheSubsystemList = nullptr;
GlobalData *TheGlobalData = nullptr;
#ifdef TheWritableGlobalData
#undef TheWritableGlobalData
#endif
GlobalData *TheWritableGlobalData = nullptr;
AudioManager *TheAudio = nullptr;

// Keep this smoke focused on Bink by satisfying AudioManager locally instead of
// pulling the full GameAudio runtime and its unrelated device dependencies.
AudioManager::AudioManager() {}
AudioManager::~AudioManager() {}
void AudioManager::init() {}
void AudioManager::postProcessLoad() {}
void AudioManager::reset() {}
void AudioManager::update() {}
void AudioManager::loseFocus() {}
void AudioManager::regainFocus() {}
AudioHandle AudioManager::addAudioEvent(const AudioEventRTS *) { return 0; }
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
UnsignedInt AudioManager::translateSpeakerTypeToUnsignedInt(const AsciiString &) { return 0; }
AsciiString AudioManager::translateUnsignedIntToSpeakerType(UnsignedInt) { return AsciiString("unknown"); }
Bool AudioManager::isOn(AudioAffect) const { return TRUE; }
void AudioManager::setOn(Bool, AudioAffect) {}
void AudioManager::setVolume(Real, AudioAffect) {}
Real AudioManager::getVolume(AudioAffect) { return 1.0f; }
void AudioManager::set3DVolumeAdjustment(Real) {}
void AudioManager::setListenerPosition(const Coord3D *, const Coord3D *) {}
const Coord3D *AudioManager::getListenerPosition() const { return nullptr; }
AudioRequest *AudioManager::allocateAudioRequest(Bool) { return nullptr; }
void AudioManager::releaseAudioRequest(AudioRequest *) {}
void AudioManager::appendAudioRequest(AudioRequest *) {}
void AudioManager::processRequestList() {}
AudioEventInfo *AudioManager::newAudioEventInfo(AsciiString) { return nullptr; }
void AudioManager::addAudioEventInfo(AudioEventInfo *) {}
AudioEventInfo *AudioManager::findAudioEventInfo(AsciiString) const { return nullptr; }
const AudioSettings *AudioManager::getAudioSettings() const { return nullptr; }
const MiscAudio *AudioManager::getMiscAudio() const { return nullptr; }
void AudioManager::releaseAudioEventRTS(AudioEventRTS *) {}
AudioSettings *AudioManager::friend_getAudioSettings() { return nullptr; }
MiscAudio *AudioManager::friend_getMiscAudio() { return nullptr; }
const FieldParse *AudioManager::getFieldParseTable() const { return nullptr; }
void AudioManager::refreshCachedVariables() {}
Real AudioManager::getAudioLengthMS(const AudioEventRTS *) { return 0.0f; }
Bool AudioManager::isMusicAlreadyLoaded() const { return TRUE; }
void AudioManager::findAllAudioEventsOfType(AudioType, std::vector<AudioEventInfo *> &) {}
Bool AudioManager::isCurrentProviderHardwareAccelerated() { return FALSE; }
Bool AudioManager::isCurrentSpeakerTypeSurroundSound() { return FALSE; }
Bool AudioManager::shouldPlayLocally(const AudioEventRTS *) { return FALSE; }
AudioHandle AudioManager::allocateNewHandle() { return 1; }
void AudioManager::removeLevelSpecificAudioEventInfos() {}
void AudioManager::removeAllAudioRequests() {}

namespace {

class SmokeAudioManager final : public AudioManager
{
public:
	void stopAudio(AudioAffect) override {}
	void pauseAudio(AudioAffect) override {}
	void resumeAudio(AudioAffect) override {}
	void pauseAmbient(Bool) override {}
	void killAudioEventImmediately(AudioHandle) override {}
	void nextMusicTrack() override {}
	void prevMusicTrack() override {}
	Bool isMusicPlaying() const override { return FALSE; }
	Bool hasMusicTrackCompleted(const AsciiString &, Int) const override { return FALSE; }
	AsciiString getMusicTrackName() const override { return AsciiString::TheEmptyString; }
	void openDevice() override {}
	void closeDevice() override {}
	void *getDevice() override { return nullptr; }
	void notifyOfAudioCompletion(UnsignedInt, UnsignedInt) override {}
	UnsignedInt getProviderCount() const override { return 1; }
	AsciiString getProviderName(UnsignedInt) const override { return AsciiString("browser-bink-smoke"); }
	UnsignedInt getProviderIndex(AsciiString) const override { return 0; }
	void selectProvider(UnsignedInt) override {}
	void unselectProvider() override {}
	UnsignedInt getSelectedProvider() const override { return 0; }
	void setSpeakerType(UnsignedInt) override {}
	UnsignedInt getSpeakerType() override { return 0; }
	UnsignedInt getNum2DSamples() const override { return 0; }
	UnsignedInt getNum3DSamples() const override { return 0; }
	UnsignedInt getNumStreams() const override { return 0; }
	Bool doesViolateLimit(AudioEventRTS *) const override { return FALSE; }
	Bool isPlayingLowerPriority(AudioEventRTS *) const override { return FALSE; }
	Bool isPlayingAlready(AudioEventRTS *) const override { return FALSE; }
	Bool isObjectPlayingVoice(UnsignedInt) const override { return FALSE; }
	void adjustVolumeOfPlayingAudio(AsciiString, Real) override {}
	void removePlayingAudio(AsciiString) override {}
	void removeAllDisabledAudio() override {}
	Bool has3DSensitiveStreamsPlaying() const override { return FALSE; }
	void *getHandleForBink() override { return reinterpret_cast<void *>(0x1); }
	void releaseHandleForBink() override { ++release_count; }
	void friend_forcePlayAudioEventRTS(const AudioEventRTS *) override {}
	void setPreferredProvider(AsciiString) override {}
	void setPreferredSpeaker(AsciiString) override {}
	Real getFileLengthMS(AsciiString) const override { return 0.0f; }
	void closeAnySamplesUsingFile(const void *) override {}

	Int release_count = 0;

protected:
	void setDeviceListenerPosition() override {}
};

class SmokeVideoBuffer final : public VideoBuffer
{
public:
	explicit SmokeVideoBuffer(Type format) : VideoBuffer(format) {}

	Bool allocate(UnsignedInt width, UnsignedInt height) override
	{
		m_width = width;
		m_height = height;
		m_textureWidth = width;
		m_textureHeight = height;
		m_pitch = width * 4;
		m_storage.assign(static_cast<std::size_t>(m_pitch) * height, 0x5a);
		return TRUE;
	}

	void free() override
	{
		VideoBuffer::free();
		m_pitch = 0;
		m_storage.clear();
	}

	void *lock() override
	{
		++lock_count;
		return m_storage.empty() ? nullptr : m_storage.data();
	}

	void unlock() override { ++unlock_count; }
	Bool valid() override { return !m_storage.empty(); }

	Int lock_count = 0;
	Int unlock_count = 0;

private:
	std::vector<unsigned char> m_storage;
};

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::fprintf(stderr, "%s\n", message);
	}
	return condition;
}

bool file_exists(const char *path)
{
	std::FILE *file = std::fopen(path, "rb");
	if (file == nullptr) {
		return false;
	}
	std::fclose(file);
	return true;
}

void add_video(VideoPlayerInterface &player, const char *internal_name, const char *filename)
{
	Video video;
	video.m_internalName = internal_name;
	video.m_filename = filename;
	player.addVideo(&video);
}

bool exercise_stream(
	VideoPlayerInterface &player,
	VideoStreamInterface *stream,
	const char *name,
	Int expected_width,
	Int expected_height,
	Int expected_frames)
{
	bool ok = expect(stream != nullptr, "BinkVideoPlayer did not open stream");
	if (stream == nullptr) {
		return false;
	}

	ok = expect(stream->width() == expected_width, "BinkVideoStream width mismatch") && ok;
	ok = expect(stream->height() == expected_height, "BinkVideoStream height mismatch") && ok;
	ok = expect(stream->frameCount() == expected_frames, "BinkVideoStream frame count mismatch") && ok;
	ok = expect(stream->frameIndex() == 0, "BinkVideoStream should start at frame index 0") && ok;
	ok = expect(stream->isFrameReady(), "BinkVideoStream first frame should be ready") && ok;
	stream->update();

	SmokeVideoBuffer buffer(VideoBuffer::TYPE_X8R8G8B8);
	ok = expect(buffer.allocate(stream->width(), stream->height()), "SmokeVideoBuffer allocate failed") && ok;
	stream->frameDecompress();
	stream->frameRender(&buffer);
	ok = expect(buffer.lock_count == 1 && buffer.unlock_count == 1,
		"BinkVideoStream::frameRender did not lock/unlock the VideoBuffer once") && ok;
	ok = expect(stream->frameIndex() == 0, "BinkDoFrame should not advance the frame cursor") && ok;

	stream->frameNext();
	ok = expect(stream->frameIndex() == 1, "BinkNextFrame should advance to frame index 1") && ok;

	stream->frameGoto(expected_frames);
	ok = expect(stream->frameIndex() == expected_frames - 1,
		"BinkVideoStream::frameGoto(frameCount) should land on the last frame") && ok;

	stream->frameGoto(0);
	ok = expect(stream->frameIndex() == 0, "BinkVideoStream::frameGoto(0) should clamp to the first frame") && ok;

	stream->close();
	ok = expect(player.firstStream() != stream, "closed BinkVideoStream should leave the player stream list") && ok;
	std::printf("%s ok: %dx%d %d frames\n", name, expected_width, expected_height, expected_frames);
	return ok;
}

} // namespace

int main()
{
	initMemoryManager();

	bool ok = expect(file_exists("artifacts/real-assets/GC_Background.bik"),
		"GC_Background.bik must be extracted before running the BinkVideoPlayer runtime smoke") &&
		expect(file_exists("artifacts/real-assets/VS_small.bik"),
			"VS_small.bik must be extracted before running the BinkVideoPlayer runtime smoke");

	SmokeAudioManager audio;
	GlobalData global_data;
	AudioManager *old_audio = TheAudio;
	GlobalData *old_global_data = TheGlobalData;
	GlobalData *old_writable_global_data = TheWritableGlobalData;
	VideoPlayerInterface *old_video_player = TheVideoPlayer;

	TheAudio = &audio;
	TheGlobalData = &global_data;
	TheWritableGlobalData = &global_data;

	BinkVideoPlayer *player = NEW BinkVideoPlayer;
	TheVideoPlayer = player;
	player->init();
	add_video(*player, "GC_Background", "GC_Background");
	add_video(*player, "VS_small", "VS_small");

	ok = expect(player->getNumVideos() == 2, "BinkVideoPlayer video registration failed") && ok;
	ok = expect(WasmBinkProviderCanDecodeFrames() == 0,
		"Bink provider decode readiness must remain false until BinkCopyToBuffer copies pixels") && ok;
	ok = exercise_stream(*player, player->open(AsciiString("GC_Background")),
		"GC_Background", 800, 600, 180) && ok;
	ok = exercise_stream(*player, player->load(AsciiString("VS_small")),
		"VS_small", 96, 120, 71) && ok;

	player->deinit();
	delete player;
	TheVideoPlayer = old_video_player;
	TheAudio = old_audio;
	TheGlobalData = old_global_data;
	TheWritableGlobalData = old_writable_global_data;

	ok = expect(audio.release_count >= 1, "BinkVideoPlayer did not release its Bink audio handle") && ok;
	return ok ? EXIT_SUCCESS : EXIT_FAILURE;
}
