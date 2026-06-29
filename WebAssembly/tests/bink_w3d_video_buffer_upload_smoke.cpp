#include "PreRTS.h"

#include <cstring>
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
#if defined(__clang__)
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wkeyword-macro"
#endif
#define protected public
#include "W3DDevice/GameClient/W3DDisplay.h"
#undef protected
#if defined(__clang__)
#pragma clang diagnostic pop
#endif
#include "ww3dformat.h"
#include "W3DDevice/GameClient/W3DVideoBuffer.h"
#include "bink.h"
#include "rect.h"
#include "render2d.h"
#include "wasm_d3d8_shim.h"
#include "wasm_ww3d_probe_lifetime.h"
#include "ww3d.h"

SubsystemInterfaceList *TheSubsystemList = nullptr;
GlobalData *TheGlobalData = nullptr;
#ifdef TheWritableGlobalData
#undef TheWritableGlobalData
#endif
GlobalData *TheWritableGlobalData = nullptr;
AudioManager *TheAudio = nullptr;

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
	AsciiString getProviderName(UnsignedInt) const override { return AsciiString("browser-bink-w3d-smoke"); }
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

struct ProbeW3DDisplayStorage
{
	W3DDisplay *prepare_for_2d_probe()
	{
		std::memset(storage, 0, sizeof(storage));
		prepared = true;
		return as_display();
	}

	bool init_for_2d_probe(unsigned int width, unsigned int height)
	{
		if (!prepared) {
			return false;
		}

		render = NEW Render2DClass;
		if (render == nullptr) {
			return false;
		}

		W3DDisplay *display = as_display();
		display->m_width = width;
		display->m_height = height;
		display->m_bitDepth = 32;
		display->m_windowed = TRUE;
		display->m_2DRender = render;
		display->m_isClippedEnabled = FALSE;
		display->m_clipRegion.lo.x = 0;
		display->m_clipRegion.lo.y = 0;
		display->m_clipRegion.hi.x = static_cast<Int>(width);
		display->m_clipRegion.hi.y = static_cast<Int>(height);
		Render2DClass::Set_Screen_Resolution(RectClass(0.0f, 0.0f,
			static_cast<float>(width), static_cast<float>(height)));
		render->Set_Coordinate_Range(RectClass(0.0f, 0.0f,
			static_cast<float>(width), static_cast<float>(height)));
		return true;
	}

	void release_probe_renderer()
	{
		if (render != nullptr) {
			render->Reset();
			delete render;
			render = nullptr;
		}
		as_display()->m_2DRender = nullptr;
	}

	W3DDisplay *as_display()
	{
		return reinterpret_cast<W3DDisplay *>(storage);
	}

	alignas(W3DDisplay) unsigned char storage[sizeof(W3DDisplay)] = {};
	Render2DClass *render = nullptr;
	bool prepared = false;
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

UnsignedInt next_power_of_two(UnsignedInt value)
{
	UnsignedInt result = 1;
	while (result < value) {
		result <<= 1;
	}
	return result;
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
	Int expected_frames,
	Int draw_left,
	Int draw_top,
	Int draw_right,
	Int draw_bottom)
{
	bool ok = expect(stream != nullptr, "BinkVideoPlayer did not open stream");
	if (stream == nullptr) {
		return false;
	}

	ok = expect(stream->width() == expected_width, "BinkVideoStream width mismatch") && ok;
	ok = expect(stream->height() == expected_height, "BinkVideoStream height mismatch") && ok;
	ok = expect(stream->frameCount() == expected_frames, "BinkVideoStream frame count mismatch") && ok;
	ok = expect(stream->isFrameReady(), "BinkVideoStream first frame should be ready") && ok;

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const UINT creates_before_allocate = state->browser_texture_create_calls;
	const UINT updates_before_allocate = state->browser_texture_update_calls;

	W3DVideoBuffer buffer(VideoBuffer::TYPE_X8R8G8B8);
	ok = expect(buffer.allocate(stream->width(), stream->height()), "W3DVideoBuffer allocate failed") && ok;
	ok = expect(buffer.valid(), "W3DVideoBuffer is not valid after allocate") && ok;
	ok = expect(buffer.texture() != nullptr, "W3DVideoBuffer did not create a TextureClass") && ok;

	const UnsignedInt expected_texture_width = next_power_of_two(stream->width());
	const UnsignedInt expected_texture_height = next_power_of_two(stream->height());
	ok = expect(buffer.width() == static_cast<UnsignedInt>(expected_width),
		"W3DVideoBuffer visible width mismatch") && ok;
	ok = expect(buffer.height() == static_cast<UnsignedInt>(expected_height),
		"W3DVideoBuffer visible height mismatch") && ok;
	ok = expect(buffer.textureWidth() == expected_texture_width,
		"W3DVideoBuffer texture width was not the validated power-of-two width") && ok;
	ok = expect(buffer.textureHeight() == expected_texture_height,
		"W3DVideoBuffer texture height was not the validated power-of-two height") && ok;
	ok = expect(buffer.pitch() == expected_texture_width * 4,
		"W3DVideoBuffer pitch does not match the backing X8R8G8B8 texture") && ok;

	state = wasm_d3d8_get_state();
	ok = expect(state->browser_texture_create_calls == creates_before_allocate + 1,
		"W3DVideoBuffer allocation did not create one browser texture") && ok;
	ok = expect(state->browser_texture_update_calls == updates_before_allocate + 1,
		"W3DVideoBuffer allocation surface unlock did not upload the initial texture") && ok;

	const UINT updates_before_render = state->browser_texture_update_calls;
	stream->frameDecompress();
	stream->frameRender(&buffer);

	state = wasm_d3d8_get_state();
	const UINT draw_calls_before_present = state->draw_indexed_primitive_calls;
	const UINT texture_binds_before_present = state->browser_texture_bind_calls;
	ok = expect(state->browser_texture_update_calls == updates_before_render + 1,
		"BinkVideoStream::frameRender through W3DVideoBuffer did not upload the texture") && ok;
	ok = expect(state->last_browser_texture_width == buffer.textureWidth(),
		"uploaded W3DVideoBuffer texture width mismatch") && ok;
	ok = expect(state->last_browser_texture_height == buffer.textureHeight(),
		"uploaded W3DVideoBuffer texture height mismatch") && ok;
	ok = expect(state->last_browser_texture_pitch == buffer.pitch(),
		"uploaded W3DVideoBuffer pitch mismatch") && ok;
	ok = expect(state->last_browser_texture_row_bytes == buffer.pitch(),
		"uploaded W3DVideoBuffer row byte count mismatch") && ok;
	ok = expect(state->last_browser_texture_format == D3DFMT_X8R8G8B8,
		"uploaded W3DVideoBuffer texture format mismatch") && ok;
	ok = expect(state->last_browser_texture_checksum != 0,
		"BinkVideoStream::frameRender uploaded an all-zero W3DVideoBuffer texture") && ok;
	const UINT decoded_upload_checksum = state->last_browser_texture_checksum;

	ProbeW3DDisplayStorage display_storage;
	W3DDisplay *display = display_storage.prepare_for_2d_probe();
	const bool display_ready =
		display != nullptr &&
		display_storage.init_for_2d_probe(1024, 768);
	ok = expect(display_ready, "probe W3DDisplay storage was not ready") && ok;

	bool draw_video_called = false;
	if (display_ready) {
		display->W3DDisplay::drawVideoBuffer(&buffer, draw_left, draw_top, draw_right, draw_bottom);
		draw_video_called = true;
	}
	display_storage.release_probe_renderer();

	state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;
	ok = expect(draw_video_called,
		"W3DDisplay::drawVideoBuffer was not called") && ok;
	ok = expect(state->draw_indexed_primitive_calls == draw_calls_before_present + 1,
		"W3DDisplay::drawVideoBuffer did not issue one indexed draw") && ok;
	ok = expect(state->browser_texture_bind_calls > texture_binds_before_present,
		"W3DDisplay::drawVideoBuffer did not bind the W3DVideoBuffer texture") && ok;
	ok = expect(state->last_draw_primitive_type == D3DPT_TRIANGLELIST,
		"W3DDisplay::drawVideoBuffer primitive type mismatch") && ok;
	ok = expect(state->last_draw_vertex_count == 4 && state->last_draw_primitive_count == 2,
		"W3DDisplay::drawVideoBuffer quad draw shape mismatch") && ok;
	ok = expect(state->last_draw_stream_source_stride == 44,
		"W3DDisplay::drawVideoBuffer Render2D vertex stride mismatch") && ok;
	ok = expect(state->last_draw_vertex_buffer_id != 0 && state->last_draw_index_buffer_id != 0,
		"W3DDisplay::drawVideoBuffer did not use browser-backed buffers") && ok;
	ok = expect((state->last_draw_transform_mask & 7u) == 7u,
		"W3DDisplay::drawVideoBuffer did not submit world/view/projection transforms") && ok;
	ok = expect(draw_state != nullptr &&
		draw_state->alpha_blend_enable == TRUE &&
		draw_state->src_blend == D3DBLEND_SRCALPHA &&
		draw_state->dest_blend == D3DBLEND_INVSRCALPHA,
		"W3DDisplay::drawVideoBuffer alpha blend state mismatch") && ok;
	ok = expect(stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_MODULATE &&
		stage0->values[D3DTSS_COLORARG1] == D3DTA_TEXTURE &&
		stage0->values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE,
		"W3DDisplay::drawVideoBuffer stage 0 texture combiner mismatch") && ok;
	ok = expect(stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE,
		"W3DDisplay::drawVideoBuffer did not disable stage 1") && ok;

	stream->frameNext();
	ok = expect(stream->frameIndex() == 1, "BinkNextFrame should advance to frame index 1") && ok;
	stream->frameGoto(expected_frames);
	ok = expect(stream->frameIndex() == expected_frames - 1,
		"BinkVideoStream::frameGoto(frameCount) should land on the last frame") && ok;
	stream->frameGoto(0);
	ok = expect(stream->frameIndex() == 0, "BinkVideoStream::frameGoto(0) should clamp to the first frame") && ok;

	stream->close();
	ok = expect(player.firstStream() != stream, "closed BinkVideoStream should leave the player stream list") && ok;
	std::printf("%s Bink W3D presentation ok: visible=%dx%d texture=%ux%u pitch=%u checksum=%u drawRect=%d,%d,%d,%d\n",
		name,
		expected_width,
		expected_height,
		buffer.textureWidth(),
		buffer.textureHeight(),
		buffer.pitch(),
		static_cast<unsigned int>(decoded_upload_checksum),
		draw_left,
		draw_top,
		draw_right,
		draw_bottom);
	return ok;
}

} // namespace

extern "C" int run_bink_w3d_video_buffer_upload_smoke()
{
	initMemoryManager();

	bool ok = expect(file_exists("artifacts/real-assets/GC_Background.bik"),
		"GC_Background.bik must be extracted before running the Bink W3DVideoBuffer upload smoke") &&
		expect(file_exists("artifacts/real-assets/VS_small.bik"),
			"VS_small.bik must be extracted before running the Bink W3DVideoBuffer upload smoke");

	wasm_d3d8_reset_state();
	bool ww3d_started = false;
	if (ok) {
		ok = expect(WW3D::Init(nullptr, nullptr, false) == WW3D_ERROR_OK, "WW3D::Init failed") && ok;
		ww3d_started = ok;
	}
	if (ok) {
		ok = expect(WW3D::Set_Render_Device(0, 1024, 768, 32, 1, false, false, true) == WW3D_ERROR_OK,
			"WW3D::Set_Render_Device failed") && ok;
	}

	SmokeAudioManager audio;
	GlobalData global_data;
	AudioManager *old_audio = TheAudio;
	GlobalData *old_global_data = TheGlobalData;
	GlobalData *old_writable_global_data = TheWritableGlobalData;
	VideoPlayerInterface *old_video_player = TheVideoPlayer;

	BinkVideoPlayer *player = nullptr;
	if (ok) {
		TheAudio = &audio;
		TheGlobalData = &global_data;
		TheWritableGlobalData = &global_data;

		player = NEW BinkVideoPlayer;
		TheVideoPlayer = player;
		player->init();
		add_video(*player, "GC_Background", "GC_Background");
		add_video(*player, "VS_small", "VS_small");

		ok = expect(player->getNumVideos() == 2, "BinkVideoPlayer video registration failed") && ok;
		ok = expect(WasmBinkProviderCanDecodeFrames() == 1,
			"Bink provider decode readiness must be true after installing the browser sidecar copy hook") && ok;
		ok = exercise_stream(*player, player->open(AsciiString("GC_Background")),
			"GC_Background", 800, 600, 180, 112, 84, 912, 684) && ok;
		ok = exercise_stream(*player, player->load(AsciiString("VS_small")),
			"VS_small", 96, 120, 71, 464, 324, 560, 444) && ok;
	}

	if (player != nullptr) {
		player->deinit();
		delete player;
	}

	TheVideoPlayer = old_video_player;
	TheAudio = old_audio;
	TheGlobalData = old_global_data;
	TheWritableGlobalData = old_writable_global_data;

	ok = expect(audio.release_count >= 1, "BinkVideoPlayer did not release its Bink audio handle") && ok;

	if (ww3d_started) {
		wasm_shutdown_ww3d_probe();
	}

	return ok ? EXIT_SUCCESS : EXIT_FAILURE;
}
