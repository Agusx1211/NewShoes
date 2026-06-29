#include "PreRTS.h"

#include <cstring>
#include <cstdio>
#include <cstdlib>
#include <vector>

#include "Common/AsciiString.h"
#include "Common/AudioAffect.h"
#include "Common/GameAudio.h"
#include "Common/GameEngine.h"
#include "Common/GameLOD.h"
#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/NameKeyGenerator.h"
#include "Common/SubsystemInterface.h"
#include "GameClient/CampaignManager.h"
#include "GameClient/DisplayString.h"
#include "GameClient/DisplayStringManager.h"
#include "GameClient/Gadget.h"
#include "GameClient/GameWindow.h"
#include "GameClient/GameWindowManager.h"
#include "GameClient/GameText.h"
#include "GameClient/Image.h"
#include "GameClient/LoadScreen.h"
#include "GameClient/Mouse.h"
#include "GameClient/VideoPlayer.h"
#include "GameClient/WinInstanceData.h"
#include "GameClient/WindowLayout.h"
#include "GameClient/WindowVideoManager.h"
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
GameEngine *TheGameEngine = nullptr;
GameLODManager *TheGameLODManager = nullptr;
class GameSpyGameInfo;
GameSpyGameInfo *TheGameSpyGame = nullptr;
Int NET_CRC_INTERVAL = 1;

extern "C" void CncPortScoreScreenSetBlankLayoutForMovie(WindowLayout *layout);
extern "C" WindowLayout *CncPortScoreScreenGetBlankLayoutForMovie();
extern "C" void CncPortScoreScreenSetFinishSinglePlayerWindowsForMovie(
	GameWindow *parentWindow,
	GameWindow *continueButton,
	GameWindow *okButton);
extern "C" void CncPortScoreScreenSetSavedTextForMovie(GameWindow *savedText);
extern "C" void CncPortScoreScreenResetFinishSinglePlayerBranchCountersForMovie();
extern "C" Int CncPortScoreScreenGetMissionSaveCallsForMovie();
extern "C" Int CncPortScoreScreenGetFreeMessageResourcesCallsForMovie();
extern "C" Int CncPortScoreScreenGetTransitionGroupCallsForMovie();
extern "C" const char *CncPortScoreScreenGetLastTransitionGroupForMovie();
extern "C" Int CncPortScoreScreenGetFinishCampaignForMovie();
extern "C" void CncPortScoreScreenFinishSinglePlayerInitForMovie();
extern "C" void CncPortScoreScreenFinishSinglePlayerFinalMovieForMovie();
extern "C" void CncPortLoadScreenSetSinglePlayerMovieForTest(const char *campaignName, const char *movieLabel);
extern "C" const char *CncPortLoadScreenGetSinglePlayerMovieForTest();
extern "C" void CncPortLoadScreenSetChallengeMovieForTest(
	const char *movieLabel,
	const char *playerPortraitMovieLeft,
	const char *opponentPortraitMovieRight);
extern "C" const char *CncPortLoadScreenGetChallengeMovieForTest();
void PlayMovieAndBlock(AsciiString movieTitle);

void setFPMode(void)
{
}

GameEngine::GameEngine() :
	m_maxFPS(DEFAULT_MAX_FPS),
	m_quitting(FALSE),
	m_isActive(TRUE)
{
}

GameEngine::~GameEngine()
{
}

void GameEngine::init(void)
{
}

void GameEngine::init(int, char **)
{
}

void GameEngine::reset(void)
{
}

void GameEngine::update(void)
{
}

void GameEngine::execute(void)
{
}

void GameEngine::setFramesPerSecondLimit(Int fps)
{
	m_maxFPS = fps;
}

Int GameEngine::getFramesPerSecondLimit(void)
{
	return m_maxFPS;
}

Bool GameEngine::isMultiplayerSession(void)
{
	return FALSE;
}

FileSystem *GameEngine::createFileSystem(void)
{
	return nullptr;
}

MessageStream *GameEngine::createMessageStream(void)
{
	return nullptr;
}

GameWindow *GameWindowManager::winCreateFromScript(AsciiString, WindowLayoutInfo *)
{
	return nullptr;
}

WindowLayout *GameWindowManager::winCreateLayout(AsciiString)
{
	return nullptr;
}

void GameWindowManager::freeStaticStrings()
{
}

WindowLayoutInfo::WindowLayoutInfo() :
	version(0),
	init(NULL),
	update(NULL),
	shutdown(NULL),
	initNameString(AsciiString::TheEmptyString),
	updateNameString(AsciiString::TheEmptyString),
	shutdownNameString(AsciiString::TheEmptyString)
{
	windows.clear();
}

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

bool present_uploaded_video_buffer(
	W3DVideoBuffer &buffer,
	Int draw_left,
	Int draw_top,
	Int draw_right,
	Int draw_bottom);

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

class SmokeDisplayString final : public DisplayString
{
	MEMORY_POOL_GLUE_WITH_EXPLICIT_CREATE(SmokeDisplayString, "SmokeDisplayString", 1, 1)

public:
	void setWordWrap(Int) override {}
	void setWordWrapCentered(Bool) override {}
	void draw(Int, Int, Color, Color) override {}
	void draw(Int, Int, Color, Color, Int, Int) override {}
	void getSize(Int *width, Int *height) override
	{
		if (width != nullptr) {
			*width = getWidth();
		}
		if (height != nullptr) {
			*height = 16;
		}
	}
	Int getWidth(Int charPos = -1) override
	{
		const Int length = charPos >= 0 ? charPos : getTextLength();
		return length * 8;
	}
	void setUseHotkey(Bool, Color) override {}
};

EMPTY_DTOR(SmokeDisplayString)

class SmokeDisplayStringManager final : public DisplayStringManager
{
public:
	DisplayString *newDisplayString() override
	{
		++new_count;
		return newInstance(SmokeDisplayString);
	}

	void freeDisplayString(DisplayString *string) override
	{
		if (string != nullptr) {
			static_cast<SmokeDisplayString *>(string)->deleteInstance();
			++free_count;
		}
	}

	DisplayString *getGroupNumeralString(Int) override { return newDisplayString(); }
	DisplayString *getFormationLetterString() override { return newDisplayString(); }

	Int new_count = 0;
	Int free_count = 0;
};

class WindowVideoProbeDisplay final : public Display
{
public:
	WindowVideoProbeDisplay()
	{
		setWidth(1024);
		setHeight(768);
		setBitDepth(32);
		setWindowed(TRUE);
	}

	VideoBuffer *createVideoBuffer() override { return NEW W3DVideoBuffer(VideoBuffer::TYPE_X8R8G8B8); }
	VideoBuffer *movieVideoBuffer() const { return m_videoBuffer; }
	VideoStreamInterface *movieVideoStream() const { return m_videoStream; }
	void setLoadScreenWindowListProbe(Bool enabled)
	{
		m_loadScreenWindowListProbe = enabled ? true : false;
		m_loadScreenPresentAllAttachedBuffers = false;
		m_loadScreenPresentCount = 0;
		m_loadScreenPresentOk = true;
	}
	void setLoadScreenWindowListProbe(Bool enabled, Bool present_all_attached_buffers)
	{
		m_loadScreenWindowListProbe = enabled ? true : false;
		m_loadScreenPresentAllAttachedBuffers = present_all_attached_buffers ? true : false;
		m_loadScreenPresentCount = 0;
		m_loadScreenPresentOk = true;
	}
	Int loadScreenPresentCount() const { return m_loadScreenPresentCount; }
	Bool loadScreenPresentOk() const { return m_loadScreenPresentOk ? TRUE : FALSE; }
	void setScoreScreenMovieWindow(GameWindow *window)
	{
		m_scoreScreenMovieWindow = window;
		m_scoreScreenPresentCount = 0;
		m_scoreScreenPresentOk = true;
	}
	Int scoreScreenPresentCount() const { return m_scoreScreenPresentCount; }
	Bool scoreScreenPresentOk() const { return m_scoreScreenPresentOk ? TRUE : FALSE; }
	void draw() override
	{
		if (m_loadScreenWindowListProbe && TheWindowManager != nullptr) {
			presentLoadScreenWindowTree(TheWindowManager->winGetWindowList());
		}

		if (m_scoreScreenMovieWindow == nullptr) {
			return;
		}

		WinInstanceData *inst_data = m_scoreScreenMovieWindow->winGetInstanceData();
		VideoBuffer *video_buffer = inst_data != nullptr ? inst_data->m_videoBuffer : nullptr;
		if (video_buffer == nullptr) {
			return;
		}

		W3DVideoBuffer *w3d_buffer = static_cast<W3DVideoBuffer *>(video_buffer);
		m_scoreScreenPresentOk =
			present_uploaded_video_buffer(*w3d_buffer, 464, 324, 560, 444) &&
			m_scoreScreenPresentOk;
		++m_scoreScreenPresentCount;
	}
	void doSmartAssetPurgeAndPreload(const char *) override {}
#if defined(_DEBUG) || defined(_INTERNAL)
	void dumpAssetUsage(const char *) override {}
	void dumpModelAssets(const char *) override {}
#endif
	void setClipRegion(IRegion2D *) override {}
	Bool isClippingEnabled() override { return FALSE; }
	void enableClipping(Bool) override {}
	void setTimeOfDay(TimeOfDay) override {}
	void createLightPulse(const Coord3D *, const RGBColor *, Real, Real, UnsignedInt, UnsignedInt) override {}
	void drawLine(Int, Int, Int, Int, Real, UnsignedInt) override {}
	void drawLine(Int, Int, Int, Int, Real, UnsignedInt, UnsignedInt) override {}
	void drawOpenRect(Int, Int, Int, Int, Real, UnsignedInt) override {}
	void drawFillRect(Int, Int, Int, Int, UnsignedInt) override {}
	void drawRectClock(Int, Int, Int, Int, Int, UnsignedInt) override {}
	void drawRemainingRectClock(Int, Int, Int, Int, Int, UnsignedInt) override {}
	void drawImage(const Image *, Int, Int, Int, Int, Color, DrawImageMode) override {}
	void drawVideoBuffer(VideoBuffer *, Int, Int, Int, Int) override {}
	void setShroudLevel(Int, Int, CellShroudStatus) override {}
	void clearShroud() override {}
	void setBorderShroudLevel(UnsignedByte) override {}
	void preloadModelAssets(AsciiString) override {}
	void preloadTextureAssets(AsciiString) override {}
	void takeScreenShot() override {}
	void toggleMovieCapture() override {}
	void toggleLetterBox() override {}
	void enableLetterBox(Bool) override {}
	Real getAverageFPS() override { return 30.0f; }
	Int getLastFrameDrawCalls() override { return 0; }

private:
	void presentLoadScreenWindowTree(GameWindow *window)
	{
		while (window != nullptr) {
			WinInstanceData *inst_data = window->winGetInstanceData();
			VideoBuffer *video_buffer = inst_data != nullptr ? inst_data->m_videoBuffer : nullptr;
			if (video_buffer != nullptr) {
				W3DVideoBuffer *w3d_buffer = static_cast<W3DVideoBuffer *>(video_buffer);
				const bool root_window = window->winGetParent() == nullptr;
				const bool full_screen_movie =
					w3d_buffer->width() == 800 &&
					w3d_buffer->height() == 600;
				const Int draw_left = full_screen_movie || root_window ? 112 : 464;
				const Int draw_top = full_screen_movie || root_window ? 84 : 324;
				const Int draw_right = full_screen_movie ? 912 : draw_left + static_cast<Int>(w3d_buffer->width());
				const Int draw_bottom = full_screen_movie ? 684 : draw_top + static_cast<Int>(w3d_buffer->height());
				m_loadScreenPresentOk =
					present_uploaded_video_buffer(*w3d_buffer, draw_left, draw_top, draw_right, draw_bottom) &&
					m_loadScreenPresentOk;
				++m_loadScreenPresentCount;
				if (!m_loadScreenPresentAllAttachedBuffers) {
					return;
				}
			}

			if (window->winGetChild() != nullptr) {
				presentLoadScreenWindowTree(window->winGetChild());
				if (!m_loadScreenPresentAllAttachedBuffers && m_loadScreenPresentCount > 0) {
					return;
				}
			}
			window = window->winGetNext();
		}
	}

	bool m_loadScreenWindowListProbe = false;
	bool m_loadScreenPresentAllAttachedBuffers = false;
	Int m_loadScreenPresentCount = 0;
	bool m_loadScreenPresentOk = true;
	GameWindow *m_scoreScreenMovieWindow = nullptr;
	Int m_scoreScreenPresentCount = 0;
	bool m_scoreScreenPresentOk = true;
};

class SmokeGameText final : public GameTextInterface
{
public:
	void init() override {}
	void reset() override {}
	void update() override {}

	UnicodeString fetch(const Char *label, Bool *exists = nullptr) override
	{
		return fetch(AsciiString(label != nullptr ? label : ""), exists);
	}

	UnicodeString fetch(AsciiString label, Bool *exists = nullptr) override
	{
		if (exists != nullptr) {
			*exists = TRUE;
		}
		UnicodeString text;
		text.translate(label);
		return text;
	}

	AsciiStringVec &getStringsWithLabelPrefix(AsciiString) override { return m_emptyStrings; }
	void initMapStringFile(const AsciiString &) override {}

private:
	AsciiStringVec m_emptyStrings;
};

class SmokeMouse final : public Mouse
{
public:
	void initCursorResources() override {}
	void setCursor(MouseCursor cursor) override { m_currentCursor = cursor; }
	void capture() override {}
	void releaseCapture() override {}

protected:
	UnsignedByte getMouseEvent(MouseIO *, Bool) override { return MOUSE_EVENT_NONE; }
};

class SmokeGameEngine final : public GameEngine
{
public:
	void init() override {}
	void reset() override {}
	void update() override {}
	void execute() override {}
	void serviceWindowsOS() override { ++service_windows_calls; }
	Bool isActive() override { return TRUE; }

	Int service_windows_calls = 0;

protected:
	LocalFileSystem *createLocalFileSystem() override { return nullptr; }
	ArchiveFileSystem *createArchiveFileSystem() override { return nullptr; }
	GameLogic *createGameLogic() override { return nullptr; }
	GameClient *createGameClient() override { return nullptr; }
	ModuleFactory *createModuleFactory() override { return nullptr; }
	ThingFactory *createThingFactory() override { return nullptr; }
	FunctionLexicon *createFunctionLexicon() override { return nullptr; }
	Radar *createRadar() override { return nullptr; }
	WebBrowser *createWebBrowser() override { return nullptr; }
	ParticleSystemManager *createParticleSystemManager() override { return nullptr; }
	AudioManager *createAudioManager() override { return nullptr; }
};

class SmokeGameWindow : public GameWindow
{
	MEMORY_POOL_GLUE_WITH_EXPLICIT_CREATE(SmokeGameWindow, "SmokeGameWindow", 1, 1)

public:
	SmokeGameWindow() = default;
	void winDrawBorder() override {}
};

EMPTY_DTOR(SmokeGameWindow)

class SmokeGameWindowManager : public GameWindowManager
{
public:
	GameWindow *allocateNewWindow() override { return newInstance(SmokeGameWindow); }
	GameWindow *winCreateFromScript(AsciiString filename, WindowLayoutInfo *info = nullptr) override
	{
		if (filename.compareNoCase(AsciiString("Menus/ChallengeLoadScreen.wnd")) == 0) {
			++challenge_layout_script_creates;
			GameWindow *root = createWindowWithId(
				nullptr,
				AsciiString("ChallengeLoadScreen.wnd:ParentChallengeLoadScreen"),
				800,
				600);
			if (root == nullptr) {
				return nullptr;
			}
			createWindowWithId(root, AsciiString("ChallengeLoadScreen.wnd:ProgressLoad"), 320, 24);
			createWindowWithId(root, AsciiString("ChallengeLoadScreen.wnd:PortraitLeft"), 96, 120);
			createWindowWithId(root, AsciiString("ChallengeLoadScreen.wnd:PortraitRight"), 96, 120);
			createWindowWithId(root, AsciiString("ChallengeLoadScreen.wnd:PortraitMovieLeft"), 96, 120);
			createWindowWithId(root, AsciiString("ChallengeLoadScreen.wnd:PortraitMovieRight"), 96, 120);
			createWindowWithId(root, AsciiString("ChallengeLoadScreen.wnd:CircleAlphaOuter"), 192, 192);
			createWindowWithId(root, AsciiString("ChallengeLoadScreen.wnd:CircleAlphaInner"), 128, 128);
			createWindowWithId(root, AsciiString("ChallengeLoadScreen.wnd:VersusBackdrop"), 128, 128);
			createWindowWithId(root, AsciiString("ChallengeLoadScreen.wnd:OverlayVs"), 96, 120);

			createWindowWithId(root, AsciiString("ChallengeLoadScreen.wnd:BioNameLeft"), 200, 24);
			createWindowWithId(root, AsciiString("ChallengeLoadScreen.wnd:BioBirthplaceLeft"), 200, 24);
			createWindowWithId(root, AsciiString("ChallengeLoadScreen.wnd:BioStrategyLeft"), 260, 48);
			createWindowWithId(root, AsciiString("ChallengeLoadScreen.wnd:BigNameEntryLeft"), 240, 28);
			createWindowWithId(root, AsciiString("ChallengeLoadScreen.wnd:BioNameEntryLeft"), 200, 24);
			createWindowWithId(root, AsciiString("ChallengeLoadScreen.wnd:BioBirthplaceEntryLeft"), 200, 24);
			createWindowWithId(root, AsciiString("ChallengeLoadScreen.wnd:BioStrategyEntryLeft"), 260, 48);

			createWindowWithId(root, AsciiString("ChallengeLoadScreen.wnd:BioNameRight"), 200, 24);
			createWindowWithId(root, AsciiString("ChallengeLoadScreen.wnd:BioBirthplaceRight"), 200, 24);
			createWindowWithId(root, AsciiString("ChallengeLoadScreen.wnd:BioStrategyRight"), 260, 48);
			createWindowWithId(root, AsciiString("ChallengeLoadScreen.wnd:BigNameEntryRight"), 240, 28);
			createWindowWithId(root, AsciiString("ChallengeLoadScreen.wnd:BioNameEntryRight"), 200, 24);
			createWindowWithId(root, AsciiString("ChallengeLoadScreen.wnd:BioBirthplaceEntryRight"), 200, 24);
			createWindowWithId(root, AsciiString("ChallengeLoadScreen.wnd:BioStrategyEntryRight"), 260, 48);
			return root;
		}

		if (filename.compareNoCase(AsciiString("Menus/SinglePlayerLoadScreen.wnd")) == 0) {
			++single_player_layout_script_creates;
			GameWindow *root = createWindowWithId(
				nullptr,
				AsciiString("SinglePlayerLoadScreen.wnd:ParentSinglePlayerLoadScreen"),
				800,
				600);
			if (root == nullptr) {
				return nullptr;
			}
			createWindowWithId(root, AsciiString("SinglePlayerLoadScreen.wnd:ProgressLoad"), 320, 24);
			createWindowWithId(root, AsciiString("SinglePlayerLoadScreen.wnd:Percent"), 96, 24);
			createWindowWithId(root, AsciiString("SinglePlayerLoadScreen.wnd:ObjectivesWin"), 480, 160);
			for (Int i = 0; i < MAX_OBJECTIVE_LINES; ++i) {
				AsciiString name;
				name.format("SinglePlayerLoadScreen.wnd:StaticTextLine%d", i);
				createWindowWithId(root, name, 480, 24);
			}
			for (Int i = 0; i < MAX_DISPLAYED_UNITS; ++i) {
				AsciiString name;
				name.format("SinglePlayerLoadScreen.wnd:StaticTextCameoText%d", i);
				createWindowWithId(root, name, 240, 24);
			}
			createWindowWithId(root, AsciiString("SinglePlayerLoadScreen.wnd:StaticTextCameoText3"), 240, 24);
			return root;
		}

		if (filename.compareNoCase(AsciiString("Menus/BlankWindow.wnd")) == 0) {
			GameWindow *window = createWindowWithId(nullptr, AsciiString("Menus/BlankWindow.wnd:Root"), 800, 600);
			if (window == nullptr) {
				return nullptr;
			}
			if (info != nullptr) {
				info->windows.push_back(window);
			}
			++blank_layout_script_creates;
			return window;
		}

		return nullptr;
	}
	WindowLayout *winCreateLayout(AsciiString filename) override
	{
		WindowLayout *layout = newInstance(WindowLayout);
		if (layout == nullptr) {
			return nullptr;
		}
		if (!layout->load(filename)) {
			layout->deleteInstance();
			return nullptr;
		}
		return layout;
	}

	GameWindow *createScoreScreenWindowForTest(AsciiString id, Int width, Int height)
	{
		return createWindowWithId(nullptr, id, width, height);
	}

	GameWindow *createScoreScreenWindowForTest(GameWindow *parent, AsciiString id, Int width, Int height)
	{
		return createWindowWithId(parent, id, width, height);
	}

	GameWindow *createScoreScreenButtonForTest(GameWindow *parent, AsciiString id, Int width, Int height)
	{
		WinInstanceData inst_data;
		inst_data.m_style = GWS_PUSH_BUTTON;
		GameWindow *window = winCreate(
			parent,
			WIN_STATUS_ENABLED,
			0,
			0,
			width,
			height,
			GadgetPushButtonSystem,
			&inst_data);
		if (window != nullptr && TheNameKeyGenerator != nullptr) {
			window->winSetWindowId(TheNameKeyGenerator->nameToKey(id));
		}
		return window;
	}

private:
	GameWindow *createWindowWithId(GameWindow *parent, AsciiString id, Int width, Int height)
	{
		GameWindow *window = allocateNewWindow();
		if (window == nullptr) {
			return nullptr;
		}

		linkWindow(window);
		window->winSetStatus(WIN_STATUS_ENABLED | WIN_STATUS_IMAGE);
		window->winSetSize(width, height);
		window->winHide(FALSE);
		if (TheNameKeyGenerator != nullptr) {
			window->winSetWindowId(TheNameKeyGenerator->nameToKey(id));
		}
		if (parent != nullptr) {
			window->winSetParent(parent);
		}
		return window;
	}

public:
	GameWinDrawFunc getPushButtonImageDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getPushButtonDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getCheckBoxImageDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getCheckBoxDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getRadioButtonImageDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getRadioButtonDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getTabControlImageDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getTabControlDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getListBoxImageDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getListBoxDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getComboBoxImageDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getComboBoxDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getHorizontalSliderImageDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getHorizontalSliderDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getVerticalSliderImageDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getVerticalSliderDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getProgressBarImageDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getProgressBarDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getStaticTextImageDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getStaticTextDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getTextEntryImageDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getTextEntryDrawFunc() override { return getDefaultDraw(); }
	GameFont *winFindFont(AsciiString, Int, Bool) override { return nullptr; }

	Int blank_layout_script_creates = 0;
	Int single_player_layout_script_creates = 0;
	Int challenge_layout_script_creates = 0;
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

bool present_uploaded_video_buffer(
	W3DVideoBuffer &buffer,
	Int draw_left,
	Int draw_top,
	Int draw_right,
	Int draw_bottom)
{
	bool ok = true;
	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const UINT draw_calls_before_present = state->draw_indexed_primitive_calls;
	const UINT texture_binds_before_present = state->browser_texture_bind_calls;

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
	ok = expect(state->browser_texture_bind_calls > texture_binds_before_present ||
		(state->last_set_texture_stage == 0 && state->last_set_texture_id != 0),
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
	return ok;
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
	ok = present_uploaded_video_buffer(buffer, draw_left, draw_top, draw_right, draw_bottom) && ok;

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

bool exercise_display_movie(VideoPlayerInterface &player)
{
	bool ok = true;
	WindowVideoProbeDisplay display;
	Display *old_display = TheDisplay;
	TheDisplay = &display;

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const UINT creates_before_play = state->browser_texture_create_calls;
	const UINT updates_before_play = state->browser_texture_update_calls;

	display.Display::playMovie(AsciiString("VS_small"));

	state = wasm_d3d8_get_state();
	VideoBuffer *display_buffer = display.movieVideoBuffer();
	VideoStreamInterface *display_stream = display.movieVideoStream();
	W3DVideoBuffer *w3d_buffer = static_cast<W3DVideoBuffer *>(display_buffer);
	const UnsignedInt expected_texture_width = next_power_of_two(96);
	const UnsignedInt expected_texture_height = next_power_of_two(120);
	ok = expect(display.Display::isMoviePlaying(),
		"Display::playMovie did not leave the movie playing") && ok;
	ok = expect(display_buffer != nullptr,
		"Display::playMovie did not allocate a VideoBuffer") && ok;
	ok = expect(display_stream != nullptr,
		"Display::playMovie did not leave an owned Bink stream on the display") && ok;
	ok = expect(player.firstStream() == display_stream,
		"Display::playMovie stream was not owned by the BinkVideoPlayer stream list") && ok;
	ok = expect(state->browser_texture_create_calls == creates_before_play + 1,
		"Display::playMovie W3DVideoBuffer allocation did not create one browser texture") && ok;
	ok = expect(state->browser_texture_update_calls == updates_before_play + 1,
		"Display::playMovie W3DVideoBuffer allocation did not upload the initial texture") && ok;
	if (display_stream != nullptr) {
		ok = expect(display_stream->width() == 96 && display_stream->height() == 120,
			"Display::playMovie opened VS_small with unexpected dimensions") && ok;
		ok = expect(display_stream->frameCount() == 71,
			"Display::playMovie opened VS_small with unexpected frame count") && ok;
		ok = expect(display_stream->frameIndex() == 0,
			"Display::playMovie should start on the first frame") && ok;
	}
	if (w3d_buffer != nullptr) {
		ok = expect(w3d_buffer->valid(), "Display W3DVideoBuffer is not valid after allocate") && ok;
		ok = expect(w3d_buffer->texture() != nullptr,
			"Display W3DVideoBuffer did not create a TextureClass") && ok;
		ok = expect(w3d_buffer->width() == 96 && w3d_buffer->height() == 120,
			"Display W3DVideoBuffer visible dimensions mismatch") && ok;
		ok = expect(w3d_buffer->textureWidth() == expected_texture_width &&
			w3d_buffer->textureHeight() == expected_texture_height,
			"Display W3DVideoBuffer backing texture dimensions mismatch") && ok;
		ok = expect(w3d_buffer->pitch() == expected_texture_width * 4,
			"Display W3DVideoBuffer pitch mismatch") && ok;
	}

	const UINT updates_before_update = state->browser_texture_update_calls;
	display.Display::update();

	state = wasm_d3d8_get_state();
	ok = expect(display.movieVideoBuffer() == display_buffer,
		"Display::update changed movie buffer ownership") && ok;
	ok = expect(display.movieVideoStream() == display_stream,
		"Display::update changed movie stream ownership") && ok;
	ok = expect(display.Display::isMoviePlaying(),
		"Display::update unexpectedly stopped a mid-stream movie") && ok;
	ok = expect(state->browser_texture_update_calls == updates_before_update + 1,
		"Display::update did not upload decoded Bink pixels through W3DVideoBuffer") && ok;
	ok = expect(state->last_browser_texture_width == expected_texture_width &&
		state->last_browser_texture_height == expected_texture_height,
		"Display decoded texture upload dimensions mismatch") && ok;
	ok = expect(state->last_browser_texture_pitch == expected_texture_width * 4,
		"Display decoded texture upload pitch mismatch") && ok;
	ok = expect(state->last_browser_texture_format == D3DFMT_X8R8G8B8,
		"Display decoded texture upload format mismatch") && ok;
	ok = expect(state->last_browser_texture_checksum != 0,
		"Display::update uploaded an all-zero decoded frame") && ok;
	if (display_stream != nullptr) {
		ok = expect(display_stream->frameIndex() == 1,
			"Display::update did not advance the Bink stream to frame index 1") && ok;
	}
	const UINT decoded_upload_checksum = state->last_browser_texture_checksum;

	if (w3d_buffer != nullptr) {
		ok = present_uploaded_video_buffer(*w3d_buffer, 464, 324, 560, 444) && ok;
		std::printf("Display VS_small Bink W3D presentation ok: visible=%ux%u texture=%ux%u pitch=%u checksum=%u drawRect=%d,%d,%d,%d\n",
			w3d_buffer->width(),
			w3d_buffer->height(),
			w3d_buffer->textureWidth(),
			w3d_buffer->textureHeight(),
			w3d_buffer->pitch(),
			static_cast<unsigned int>(decoded_upload_checksum),
			464,
			324,
			560,
			444);
	}

	display.Display::stopMovie();
	ok = expect(!display.Display::isMoviePlaying(),
		"Display::stopMovie did not clear movie playback state") && ok;
	ok = expect(display.movieVideoBuffer() == nullptr,
		"Display::stopMovie did not clear the movie VideoBuffer") && ok;
	ok = expect(display.movieVideoStream() == nullptr,
		"Display::stopMovie did not clear the movie stream") && ok;
	ok = expect(player.firstStream() == nullptr,
		"Display::stopMovie did not close the owned Bink stream") && ok;

	TheDisplay = old_display;
	return ok;
}

bool exercise_window_video_manager(VideoPlayerInterface &player)
{
	bool ok = true;
	SmokeGameWindowManager window_manager;
	WindowVideoProbeDisplay display;
	GameWindowManager *old_window_manager = TheWindowManager;
	Display *old_display = TheDisplay;
	TheWindowManager = &window_manager;
	TheDisplay = &display;

	GameWindow *window = window_manager.allocateNewWindow();
	ok = expect(window != nullptr, "SmokeGameWindow allocation failed") && ok;
	if (window != nullptr) {
		window_manager.linkWindow(window);
		window->winSetStatus(WIN_STATUS_ENABLED);
		window->winSetSize(96, 120);
		window->winHide(FALSE);
	}

	WindowVideoManager video_manager;
	video_manager.init();

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const UINT creates_before_play = state->browser_texture_create_calls;
	const UINT updates_before_play = state->browser_texture_update_calls;

	if (window != nullptr) {
		video_manager.playMovie(window, AsciiString("VS_small"), WINDOW_PLAY_MOVIE_SHOW_LAST_FRAME);
	}

	state = wasm_d3d8_get_state();
	VideoBuffer *attached_buffer = window != nullptr ? window->winGetInstanceData()->m_videoBuffer : nullptr;
	W3DVideoBuffer *w3d_buffer = static_cast<W3DVideoBuffer *>(attached_buffer);
	const UnsignedInt expected_texture_width = next_power_of_two(96);
	const UnsignedInt expected_texture_height = next_power_of_two(120);
	ok = expect(attached_buffer != nullptr,
		"WindowVideoManager::playMovie did not attach a VideoBuffer to the GameWindow") && ok;
	ok = expect(video_manager.getWinState(window) == WINDOW_VIDEO_STATE_PLAY,
		"WindowVideoManager::playMovie did not leave the window video in PLAY state") && ok;
	ok = expect(player.firstStream() != nullptr,
		"WindowVideoManager::playMovie did not leave an owned Bink stream on the player") && ok;
	ok = expect(state->browser_texture_create_calls == creates_before_play + 1,
		"WindowVideoManager::playMovie W3DVideoBuffer allocation did not create one browser texture") && ok;
	ok = expect(state->browser_texture_update_calls == updates_before_play + 1,
		"WindowVideoManager::playMovie W3DVideoBuffer allocation did not upload the initial texture") && ok;
	if (w3d_buffer != nullptr) {
		ok = expect(w3d_buffer->valid(), "WindowVideoManager W3DVideoBuffer is not valid after allocate") && ok;
		ok = expect(w3d_buffer->texture() != nullptr,
			"WindowVideoManager W3DVideoBuffer did not create a TextureClass") && ok;
		ok = expect(w3d_buffer->width() == 96 && w3d_buffer->height() == 120,
			"WindowVideoManager W3DVideoBuffer visible dimensions mismatch") && ok;
		ok = expect(w3d_buffer->textureWidth() == expected_texture_width &&
			w3d_buffer->textureHeight() == expected_texture_height,
			"WindowVideoManager W3DVideoBuffer backing texture dimensions mismatch") && ok;
		ok = expect(w3d_buffer->pitch() == expected_texture_width * 4,
			"WindowVideoManager W3DVideoBuffer pitch mismatch") && ok;
	}

	const UINT updates_before_update = state->browser_texture_update_calls;
	video_manager.update();

	state = wasm_d3d8_get_state();
	ok = expect(window == nullptr || window->winGetInstanceData()->m_videoBuffer == attached_buffer,
		"WindowVideoManager::update changed the GameWindow video buffer ownership") && ok;
	ok = expect(video_manager.getWinState(window) == WINDOW_VIDEO_STATE_PLAY,
		"WindowVideoManager::update unexpectedly paused or stopped a mid-stream movie") && ok;
	ok = expect(state->browser_texture_update_calls == updates_before_update + 1,
		"WindowVideoManager::update did not upload decoded Bink pixels through W3DVideoBuffer") && ok;
	ok = expect(state->last_browser_texture_width == expected_texture_width &&
		state->last_browser_texture_height == expected_texture_height,
		"WindowVideoManager decoded texture upload dimensions mismatch") && ok;
	ok = expect(state->last_browser_texture_pitch == expected_texture_width * 4,
		"WindowVideoManager decoded texture upload pitch mismatch") && ok;
	ok = expect(state->last_browser_texture_format == D3DFMT_X8R8G8B8,
		"WindowVideoManager decoded texture upload format mismatch") && ok;
	ok = expect(state->last_browser_texture_checksum != 0,
		"WindowVideoManager::update uploaded an all-zero decoded frame") && ok;
	const UINT decoded_upload_checksum = state->last_browser_texture_checksum;

	if (w3d_buffer != nullptr) {
		ok = present_uploaded_video_buffer(*w3d_buffer, 464, 324, 560, 444) && ok;
		std::printf("WindowVideoManager VS_small Bink W3D presentation ok: visible=%ux%u texture=%ux%u pitch=%u checksum=%u drawRect=%d,%d,%d,%d\n",
			w3d_buffer->width(),
			w3d_buffer->height(),
			w3d_buffer->textureWidth(),
			w3d_buffer->textureHeight(),
			w3d_buffer->pitch(),
			static_cast<unsigned int>(decoded_upload_checksum),
			464,
			324,
			560,
			444);
	}

	video_manager.reset();
	ok = expect(window == nullptr || window->winGetInstanceData()->m_videoBuffer == nullptr,
		"WindowVideoManager::reset did not clear the GameWindow video buffer") && ok;
	ok = expect(video_manager.getWinState(window) == WINDOW_VIDEO_STATE_STOP,
		"WindowVideoManager::reset did not remove the window video entry") && ok;
	ok = expect(player.firstStream() == nullptr,
		"WindowVideoManager::reset did not close the owned Bink stream") && ok;

	if (window != nullptr) {
		window_manager.winDestroy(window);
		window_manager.update();
	}
	TheDisplay = old_display;
	TheWindowManager = old_window_manager;
	return ok;
}

bool exercise_blank_layout_movie_path(VideoPlayerInterface &player)
{
	bool ok = true;
	SmokeGameWindowManager window_manager;
	WindowVideoProbeDisplay display;
	GameWindowManager *old_window_manager = TheWindowManager;
	Display *old_display = TheDisplay;
	TheWindowManager = &window_manager;
	TheDisplay = &display;

	WindowLayout *layout = TheWindowManager->winCreateLayout(AsciiString("Menus/BlankWindow.wnd"));
	GameWindow *movie_window = layout != nullptr ? layout->getFirstWindow() : nullptr;
	ok = expect(layout != nullptr,
		"blank WindowLayout was not created through GameWindowManager::winCreateLayout") && ok;
	ok = expect(window_manager.blank_layout_script_creates == 1,
		"blank WindowLayout did not load through winCreateFromScript") && ok;
	ok = expect(movie_window != nullptr,
		"blank WindowLayout did not own a first GameWindow") && ok;
	ok = expect(movie_window == nullptr || movie_window->winGetLayout() == layout,
		"blank layout first window did not point back to its WindowLayout") && ok;

	if (layout != nullptr) {
		layout->hide(FALSE);
		layout->bringForward();
		if (movie_window != nullptr) {
			movie_window->winClearStatus(WIN_STATUS_IMAGE);
		}
	}

	VideoStreamInterface *stream = TheVideoPlayer->open(AsciiString("VS_small"));
	ok = expect(stream != nullptr, "blank layout path did not open VS_small") && ok;
	if (stream != nullptr) {
		ok = expect(stream->width() == 96 && stream->height() == 120,
			"blank layout path opened VS_small with unexpected dimensions") && ok;
		ok = expect(stream->frameCount() == 71,
			"blank layout path opened VS_small with unexpected frame count") && ok;
	}

	VideoBuffer *video_buffer = TheDisplay->createVideoBuffer();
	W3DVideoBuffer *w3d_buffer = static_cast<W3DVideoBuffer *>(video_buffer);
	const UnsignedInt expected_texture_width = next_power_of_two(96);
	const UnsignedInt expected_texture_height = next_power_of_two(120);
	ok = expect(video_buffer != nullptr,
		"blank layout path did not create a VideoBuffer") && ok;
	if (video_buffer != nullptr && stream != nullptr) {
		ok = expect(video_buffer->allocate(stream->width(), stream->height()),
			"blank layout path could not allocate the VideoBuffer") && ok;
	}
	if (w3d_buffer != nullptr) {
		ok = expect(w3d_buffer->valid(),
			"blank layout W3DVideoBuffer is not valid after allocate") && ok;
		ok = expect(w3d_buffer->texture() != nullptr,
			"blank layout W3DVideoBuffer did not create a TextureClass") && ok;
		ok = expect(w3d_buffer->width() == 96 && w3d_buffer->height() == 120,
			"blank layout W3DVideoBuffer visible dimensions mismatch") && ok;
		ok = expect(w3d_buffer->textureWidth() == expected_texture_width &&
			w3d_buffer->textureHeight() == expected_texture_height,
			"blank layout W3DVideoBuffer backing texture dimensions mismatch") && ok;
		ok = expect(w3d_buffer->pitch() == expected_texture_width * 4,
			"blank layout W3DVideoBuffer pitch mismatch") && ok;
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const UINT updates_before_render = state->browser_texture_update_calls;
	TheWritableGlobalData->m_loadScreenRender = TRUE;
	if (stream != nullptr && video_buffer != nullptr) {
		ok = expect(stream->isFrameReady(),
			"blank layout path VS_small first frame should be ready") && ok;
		stream->frameDecompress();
		stream->frameRender(video_buffer);
		stream->frameNext();
	}
	if (movie_window != nullptr) {
		movie_window->winGetInstanceData()->setVideoBuffer(video_buffer);
	}

	state = wasm_d3d8_get_state();
	ok = expect(state->browser_texture_update_calls == updates_before_render + 1,
		"blank layout path did not upload decoded Bink pixels through W3DVideoBuffer") && ok;
	ok = expect(movie_window == nullptr || movie_window->winGetInstanceData()->m_videoBuffer == video_buffer,
		"blank layout first window did not own the decoded VideoBuffer") && ok;
	ok = expect(state->last_browser_texture_width == expected_texture_width &&
		state->last_browser_texture_height == expected_texture_height,
		"blank layout decoded texture upload dimensions mismatch") && ok;
	ok = expect(state->last_browser_texture_pitch == expected_texture_width * 4,
		"blank layout decoded texture upload pitch mismatch") && ok;
	ok = expect(state->last_browser_texture_format == D3DFMT_X8R8G8B8,
		"blank layout decoded texture upload format mismatch") && ok;
	ok = expect(state->last_browser_texture_checksum != 0,
		"blank layout path uploaded an all-zero decoded frame") && ok;
	if (stream != nullptr) {
		ok = expect(stream->frameIndex() == 1,
			"blank layout path did not advance VS_small to frame index 1") && ok;
	}
	const UINT decoded_upload_checksum = state->last_browser_texture_checksum;

	if (w3d_buffer != nullptr) {
		ok = present_uploaded_video_buffer(*w3d_buffer, 464, 324, 560, 444) && ok;
		std::printf("Blank layout VS_small Bink W3D presentation ok: visible=%ux%u texture=%ux%u pitch=%u checksum=%u drawRect=%d,%d,%d,%d\n",
			w3d_buffer->width(),
			w3d_buffer->height(),
			w3d_buffer->textureWidth(),
			w3d_buffer->textureHeight(),
			w3d_buffer->pitch(),
			static_cast<unsigned int>(decoded_upload_checksum),
			464,
			324,
			560,
			444);
	}

	TheWritableGlobalData->m_loadScreenRender = FALSE;
	if (movie_window != nullptr) {
		movie_window->winGetInstanceData()->setVideoBuffer(nullptr);
	}
	if (video_buffer != nullptr) {
		delete video_buffer;
		video_buffer = nullptr;
	}
	if (stream != nullptr) {
		stream->close();
		stream = nullptr;
	}
	ok = expect(player.firstStream() == nullptr,
		"blank layout path did not close the owned Bink stream") && ok;

	if (layout != nullptr) {
		layout->destroyWindows();
		ok = expect(layout->getFirstWindow() == nullptr,
			"WindowLayout::destroyWindows did not clear the blank layout first window") && ok;
		layout->deleteInstance();
	}
	window_manager.update();

	TheDisplay = old_display;
	TheWindowManager = old_window_manager;
	return ok;
}

bool exercise_score_screen_play_movie_and_block(VideoPlayerInterface &player)
{
	bool ok = true;
	SmokeGameWindowManager window_manager;
	WindowVideoProbeDisplay display;
	SmokeGameEngine game_engine;
	GameWindowManager *old_window_manager = TheWindowManager;
	Display *old_display = TheDisplay;
	GameEngine *old_game_engine = TheGameEngine;
	TheWindowManager = &window_manager;
	TheDisplay = &display;
	TheGameEngine = &game_engine;

	WindowLayout *layout = TheWindowManager->winCreateLayout(AsciiString("Menus/BlankWindow.wnd"));
	GameWindow *movie_window = layout != nullptr ? layout->getFirstWindow() : nullptr;
	ok = expect(layout != nullptr,
		"ScoreScreen movie path blank WindowLayout was not created") && ok;
	ok = expect(window_manager.blank_layout_script_creates == 1,
		"ScoreScreen movie path did not load BlankWindow.wnd through winCreateFromScript") && ok;
	ok = expect(movie_window != nullptr,
		"ScoreScreen movie path blank layout did not own a first GameWindow") && ok;

	if (layout != nullptr) {
		layout->hide(FALSE);
		layout->bringForward();
		if (movie_window != nullptr) {
			movie_window->winClearStatus(WIN_STATUS_IMAGE);
		}
	}

	display.setScoreScreenMovieWindow(movie_window);
	CncPortScoreScreenSetBlankLayoutForMovie(layout);
	ok = expect(CncPortScoreScreenGetBlankLayoutForMovie() == layout,
		"ScoreScreen movie path did not install the blank layout hook") && ok;

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const UINT creates_before_play = state->browser_texture_create_calls;
	const UINT updates_before_play = state->browser_texture_update_calls;
	const UINT releases_before_play = state->browser_texture_release_calls;
	const UINT draws_before_play = state->draw_indexed_primitive_calls;
	const Int expected_presented_frames = 70;

	PlayMovieAndBlock(AsciiString("VS_small"));

	state = wasm_d3d8_get_state();
	ok = expect(game_engine.service_windows_calls == expected_presented_frames,
		"ScoreScreen::PlayMovieAndBlock did not service the OS once per presented frame") && ok;
	ok = expect(display.scoreScreenPresentOk(),
		"ScoreScreen::PlayMovieAndBlock display draw presentation failed") && ok;
	ok = expect(display.scoreScreenPresentCount() == expected_presented_frames,
		"ScoreScreen::PlayMovieAndBlock did not present the expected VS_small frames") && ok;
	ok = expect(state->browser_texture_create_calls == creates_before_play + 1,
		"ScoreScreen::PlayMovieAndBlock did not allocate one W3DVideoBuffer texture") && ok;
	ok = expect(state->browser_texture_update_calls == updates_before_play + 1 + expected_presented_frames,
		"ScoreScreen::PlayMovieAndBlock did not upload the initial texture plus decoded frames") && ok;
	ok = expect(state->browser_texture_release_calls == releases_before_play + 1,
		"ScoreScreen::PlayMovieAndBlock did not release the W3DVideoBuffer texture") && ok;
	ok = expect(state->draw_indexed_primitive_calls == draws_before_play + expected_presented_frames,
		"ScoreScreen::PlayMovieAndBlock did not draw every decoded frame") && ok;
	ok = expect(movie_window == nullptr || movie_window->winGetInstanceData()->m_videoBuffer == nullptr,
		"ScoreScreen::PlayMovieAndBlock did not detach the movie VideoBuffer") && ok;
	ok = expect(TheWritableGlobalData->m_loadScreenRender == FALSE,
		"ScoreScreen::PlayMovieAndBlock did not clear m_loadScreenRender") && ok;
	ok = expect(player.firstStream() == nullptr,
		"ScoreScreen::PlayMovieAndBlock did not close the owned Bink stream") && ok;
	ok = expect(state->last_browser_texture_width == next_power_of_two(96) &&
		state->last_browser_texture_height == next_power_of_two(120),
		"ScoreScreen::PlayMovieAndBlock decoded texture dimensions mismatch") && ok;
	ok = expect(state->last_browser_texture_pitch == next_power_of_two(96) * 4,
		"ScoreScreen::PlayMovieAndBlock decoded texture pitch mismatch") && ok;
	ok = expect(state->last_browser_texture_format == D3DFMT_X8R8G8B8,
		"ScoreScreen::PlayMovieAndBlock decoded texture format mismatch") && ok;
	ok = expect(state->last_browser_texture_checksum != 0,
		"ScoreScreen::PlayMovieAndBlock uploaded an all-zero decoded frame") && ok;

	std::printf("ScoreScreen PlayMovieAndBlock VS_small Bink W3D presentation ok: frames=%d texture=%ux%u pitch=%u checksum=%u drawRect=%d,%d,%d,%d\n",
		expected_presented_frames,
		next_power_of_two(96),
		next_power_of_two(120),
		next_power_of_two(96) * 4,
		static_cast<unsigned int>(state->last_browser_texture_checksum),
		464,
		324,
		560,
		444);

	CncPortScoreScreenSetBlankLayoutForMovie(nullptr);
	display.setScoreScreenMovieWindow(nullptr);
	if (layout != nullptr) {
		layout->destroyWindows();
		ok = expect(layout->getFirstWindow() == nullptr,
			"ScoreScreen movie path WindowLayout::destroyWindows did not clear the first window") && ok;
		layout->deleteInstance();
	}
	window_manager.update();

	TheGameEngine = old_game_engine;
	TheDisplay = old_display;
	TheWindowManager = old_window_manager;
	return ok;
}

bool exercise_score_screen_finish_single_player_final_movie(VideoPlayerInterface &player)
{
	bool ok = true;
	SmokeGameWindowManager window_manager;
	WindowVideoProbeDisplay display;
	SmokeGameEngine game_engine;
	NameKeyGenerator name_key_generator;
	SmokeGameText game_text;
	SmokeDisplayStringManager display_string_manager;
	CampaignManager campaign_manager;
	GameWindowManager *old_window_manager = TheWindowManager;
	Display *old_display = TheDisplay;
	GameEngine *old_game_engine = TheGameEngine;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	GameTextInterface *old_game_text = TheGameText;
	DisplayStringManager *old_display_string_manager = TheDisplayStringManager;
	CampaignManager *old_campaign_manager = TheCampaignManager;
	GameLODManager *old_game_lod_manager = TheGameLODManager;
	TheWindowManager = &window_manager;
	TheDisplay = &display;
	TheGameEngine = &game_engine;
	TheNameKeyGenerator = &name_key_generator;
	TheGameText = &game_text;
	TheDisplayStringManager = &display_string_manager;
	TheCampaignManager = &campaign_manager;
	TheGameLODManager = nullptr;

	WindowLayout *layout = TheWindowManager->winCreateLayout(AsciiString("Menus/BlankWindow.wnd"));
	GameWindow *movie_window = layout != nullptr ? layout->getFirstWindow() : nullptr;
	ok = expect(layout != nullptr,
		"ScoreScreen finishSinglePlayerInit movie path blank WindowLayout was not created") && ok;
	ok = expect(movie_window != nullptr,
		"ScoreScreen finishSinglePlayerInit movie path blank layout did not own a first GameWindow") && ok;
	if (layout != nullptr) {
		layout->hide(FALSE);
		layout->bringForward();
		if (movie_window != nullptr) {
			movie_window->winClearStatus(WIN_STATUS_IMAGE);
		}
	}

	GameWindow *score_parent = window_manager.createScoreScreenWindowForTest(
		AsciiString("ScoreScreen.wnd:ParentScoreScreen"), 800, 600);
	GameWindow *button_continue = window_manager.createScoreScreenButtonForTest(
		score_parent, AsciiString("ScoreScreen.wnd:ButtonContinue"), 160, 32);
	GameWindow *button_ok = window_manager.createScoreScreenButtonForTest(
		score_parent, AsciiString("ScoreScreen.wnd:ButtonOk"), 96, 32);
	ok = expect(score_parent != nullptr,
		"ScoreScreen finishSinglePlayerInit movie path did not create the score parent window") && ok;
	ok = expect(button_continue != nullptr,
		"ScoreScreen finishSinglePlayerInit movie path did not create the continue button") && ok;
	ok = expect(button_ok != nullptr,
		"ScoreScreen finishSinglePlayerInit movie path did not create the ok button") && ok;

	display.setScoreScreenMovieWindow(movie_window);
	CncPortScoreScreenSetBlankLayoutForMovie(layout);
	CncPortScoreScreenSetFinishSinglePlayerWindowsForMovie(score_parent, button_continue, button_ok);

	Campaign *campaign = campaign_manager.newCampaign(AsciiString("smoke_campaign"));
	ok = expect(campaign != nullptr,
		"ScoreScreen finishSinglePlayerInit movie path did not create a campaign") && ok;
	if (campaign != nullptr) {
		campaign->m_firstMission.set(AsciiString("mission1"));
		campaign->m_finalMovieName.set(AsciiString("VS_small"));
		Mission *mission = campaign->newMission(AsciiString("mission1"));
		ok = expect(mission != nullptr,
			"ScoreScreen finishSinglePlayerInit movie path did not create a mission") && ok;
		if (mission != nullptr) {
			mission->m_mapName.set(AsciiString("Maps/Smoke/Smoke.map"));
			mission->m_nextMission.clear();
		}
		campaign_manager.setCampaignAndMission(AsciiString("smoke_campaign"), AsciiString("mission1"));
	}
	campaign_manager.setGameDifficulty(DIFFICULTY_NORMAL);
	campaign_manager.SetVictorious(TRUE);
	ok = expect(campaign_manager.isVictorious(),
		"ScoreScreen finishSinglePlayerInit movie path did not mark the campaign victorious") && ok;
	ok = expect(campaign_manager.getCurrentMission() != nullptr,
		"ScoreScreen finishSinglePlayerInit movie path did not select the current mission") && ok;

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const UINT creates_before_finish = state->browser_texture_create_calls;
	const UINT updates_before_finish = state->browser_texture_update_calls;
	const UINT releases_before_finish = state->browser_texture_release_calls;
	const UINT draws_before_finish = state->draw_indexed_primitive_calls;
	const Int expected_presented_frames = 70;

	CncPortScoreScreenFinishSinglePlayerFinalMovieForMovie();

	state = wasm_d3d8_get_state();
	ok = expect(CncPortScoreScreenGetFinishCampaignForMovie() == 1,
		"ScoreScreen finishSinglePlayerInit did not set the finish-campaign button state") && ok;
	ok = expect(CncPortScoreScreenGetBlankLayoutForMovie() == nullptr,
		"ScoreScreen finishSinglePlayerInit did not clear the blank layout pointer") && ok;
	ok = expect(campaign_manager.getCurrentMission() == nullptr,
		"ScoreScreen finishSinglePlayerInit did not advance past the final mission") && ok;
	ok = expect(campaign_manager.getCurrentMap().isEmpty(),
		"ScoreScreen finishSinglePlayerInit did not leave the current map empty after campaign completion") && ok;
	ok = expect(game_engine.service_windows_calls == expected_presented_frames,
		"ScoreScreen finishSinglePlayerInit final movie did not service the OS once per presented frame") && ok;
	ok = expect(display.scoreScreenPresentOk(),
		"ScoreScreen finishSinglePlayerInit final movie display presentation failed") && ok;
	ok = expect(display.scoreScreenPresentCount() == expected_presented_frames,
		"ScoreScreen finishSinglePlayerInit did not present the expected VS_small frames") && ok;
	ok = expect(state->browser_texture_create_calls == creates_before_finish + 1,
		"ScoreScreen finishSinglePlayerInit final movie did not allocate one W3DVideoBuffer texture") && ok;
	ok = expect(state->browser_texture_update_calls == updates_before_finish + 1 + expected_presented_frames,
		"ScoreScreen finishSinglePlayerInit final movie did not upload the initial texture plus decoded frames") && ok;
	ok = expect(state->browser_texture_release_calls == releases_before_finish + 1,
		"ScoreScreen finishSinglePlayerInit final movie did not release the W3DVideoBuffer texture") && ok;
	ok = expect(state->draw_indexed_primitive_calls == draws_before_finish + expected_presented_frames,
		"ScoreScreen finishSinglePlayerInit final movie did not draw every decoded frame") && ok;
	ok = expect(player.firstStream() == nullptr,
		"ScoreScreen finishSinglePlayerInit did not close the owned Bink stream") && ok;
	ok = expect(state->last_browser_texture_width == next_power_of_two(96) &&
		state->last_browser_texture_height == next_power_of_two(120),
		"ScoreScreen finishSinglePlayerInit final movie decoded texture dimensions mismatch") && ok;
	ok = expect(state->last_browser_texture_pitch == next_power_of_two(96) * 4,
		"ScoreScreen finishSinglePlayerInit final movie decoded texture pitch mismatch") && ok;
	ok = expect(state->last_browser_texture_format == D3DFMT_X8R8G8B8,
		"ScoreScreen finishSinglePlayerInit final movie decoded texture format mismatch") && ok;
	ok = expect(state->last_browser_texture_checksum != 0,
		"ScoreScreen finishSinglePlayerInit final movie uploaded an all-zero decoded frame") && ok;

	std::printf("ScoreScreen finishSinglePlayerInit final VS_small Bink W3D presentation ok: frames=%d texture=%ux%u pitch=%u checksum=%u drawRect=%d,%d,%d,%d\n",
		expected_presented_frames,
		next_power_of_two(96),
		next_power_of_two(120),
		next_power_of_two(96) * 4,
		static_cast<unsigned int>(state->last_browser_texture_checksum),
		464,
		324,
		560,
		444);

	CncPortScoreScreenSetFinishSinglePlayerWindowsForMovie(nullptr, nullptr, nullptr);
	CncPortScoreScreenSetBlankLayoutForMovie(nullptr);
	display.setScoreScreenMovieWindow(nullptr);
	if (score_parent != nullptr) {
		window_manager.winDestroy(score_parent);
		window_manager.update();
	}
	ok = expect(display_string_manager.free_count >= 1,
		"ScoreScreen finishSinglePlayerInit did not release button display strings during cleanup") && ok;

	TheGameLODManager = old_game_lod_manager;
	TheCampaignManager = old_campaign_manager;
	TheDisplayStringManager = old_display_string_manager;
	TheGameText = old_game_text;
	TheNameKeyGenerator = old_name_key_generator;
	TheGameEngine = old_game_engine;
	TheDisplay = old_display;
	TheWindowManager = old_window_manager;
	return ok;
}

bool exercise_score_screen_finish_single_player_non_final_victory()
{
	bool ok = true;
	SmokeGameWindowManager window_manager;
	SmokeGameEngine game_engine;
	NameKeyGenerator name_key_generator;
	SmokeGameText game_text;
	SmokeDisplayStringManager display_string_manager;
	CampaignManager campaign_manager;
	GameWindowManager *old_window_manager = TheWindowManager;
	GameEngine *old_game_engine = TheGameEngine;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	GameTextInterface *old_game_text = TheGameText;
	DisplayStringManager *old_display_string_manager = TheDisplayStringManager;
	CampaignManager *old_campaign_manager = TheCampaignManager;
	TheWindowManager = &window_manager;
	TheGameEngine = &game_engine;
	TheNameKeyGenerator = &name_key_generator;
	TheGameText = &game_text;
	TheDisplayStringManager = &display_string_manager;
	TheCampaignManager = &campaign_manager;

	WindowLayout *layout = TheWindowManager->winCreateLayout(AsciiString("Menus/BlankWindow.wnd"));
	GameWindow *movie_window = layout != nullptr ? layout->getFirstWindow() : nullptr;
	ok = expect(layout != nullptr,
		"ScoreScreen finishSinglePlayerInit non-final branch blank WindowLayout was not created") && ok;
	ok = expect(movie_window != nullptr,
		"ScoreScreen finishSinglePlayerInit non-final branch blank layout did not own a first GameWindow") && ok;
	if (layout != nullptr) {
		layout->hide(FALSE);
		layout->bringForward();
		if (movie_window != nullptr) {
			movie_window->winClearStatus(WIN_STATUS_IMAGE);
		}
	}

	GameWindow *score_parent = window_manager.createScoreScreenWindowForTest(
		AsciiString("ScoreScreen.wnd:ParentScoreScreen"), 800, 600);
	GameWindow *button_continue = window_manager.createScoreScreenButtonForTest(
		score_parent, AsciiString("ScoreScreen.wnd:ButtonContinue"), 160, 32);
	GameWindow *button_ok = window_manager.createScoreScreenButtonForTest(
		score_parent, AsciiString("ScoreScreen.wnd:ButtonOk"), 96, 32);
	GameWindow *static_text_game_saved = window_manager.createScoreScreenWindowForTest(
		score_parent, AsciiString("ScoreScreen.wnd:StaticTextGameSaved"), 240, 24);
	ok = expect(score_parent != nullptr,
		"ScoreScreen finishSinglePlayerInit non-final branch did not create the score parent window") && ok;
	ok = expect(button_continue != nullptr,
		"ScoreScreen finishSinglePlayerInit non-final branch did not create the continue button") && ok;
	ok = expect(button_ok != nullptr,
		"ScoreScreen finishSinglePlayerInit non-final branch did not create the ok button") && ok;
	ok = expect(static_text_game_saved != nullptr,
		"ScoreScreen finishSinglePlayerInit non-final branch did not create the saved-game text window") && ok;
	if (static_text_game_saved != nullptr) {
		static_text_game_saved->winHide(TRUE);
	}

	CncPortScoreScreenSetBlankLayoutForMovie(layout);
	CncPortScoreScreenSetFinishSinglePlayerWindowsForMovie(score_parent, button_continue, button_ok);
	CncPortScoreScreenSetSavedTextForMovie(static_text_game_saved);

	Campaign *campaign = campaign_manager.newCampaign(AsciiString("smoke_campaign"));
	ok = expect(campaign != nullptr,
		"ScoreScreen finishSinglePlayerInit non-final branch did not create a campaign") && ok;
	if (campaign != nullptr) {
		campaign->m_campaignNameLabel.set(AsciiString("GUI:SmokeCampaign"));
		campaign->m_firstMission.set(AsciiString("mission1"));
		Mission *mission1 = campaign->newMission(AsciiString("mission1"));
		Mission *mission2 = campaign->newMission(AsciiString("mission2"));
		ok = expect(mission1 != nullptr,
			"ScoreScreen finishSinglePlayerInit non-final branch did not create mission1") && ok;
		ok = expect(mission2 != nullptr,
			"ScoreScreen finishSinglePlayerInit non-final branch did not create mission2") && ok;
		if (mission1 != nullptr) {
			mission1->m_mapName.set(AsciiString("Maps/Smoke/First.map"));
			mission1->m_nextMission.set(AsciiString("mission2"));
		}
		if (mission2 != nullptr) {
			mission2->m_mapName.set(AsciiString("Maps/Smoke/Next.map"));
			mission2->m_nextMission.clear();
		}
		campaign_manager.setCampaignAndMission(AsciiString("smoke_campaign"), AsciiString("mission1"));
	}
	campaign_manager.setGameDifficulty(DIFFICULTY_NORMAL);
	campaign_manager.SetVictorious(TRUE);
	ok = expect(campaign_manager.isVictorious(),
		"ScoreScreen finishSinglePlayerInit non-final branch did not mark the campaign victorious") && ok;
	ok = expect(campaign_manager.getCurrentMission() != nullptr,
		"ScoreScreen finishSinglePlayerInit non-final branch did not select the current mission") && ok;

	CncPortScoreScreenResetFinishSinglePlayerBranchCountersForMovie();

	CncPortScoreScreenFinishSinglePlayerInitForMovie();

	const UnicodeString continue_text = button_continue != nullptr ?
		button_continue->winGetInstanceData()->getText() :
		UnicodeString::TheEmptyString;
	ok = expect(continue_text == game_text.fetch("GUI:SaveAndContinue"),
		"ScoreScreen finishSinglePlayerInit non-final branch did not set SaveAndContinue text") && ok;
	ok = expect(CncPortScoreScreenGetFinishCampaignForMovie() == 0,
		"ScoreScreen finishSinglePlayerInit non-final branch incorrectly set finish-campaign state") && ok;
	ok = expect(CncPortScoreScreenGetBlankLayoutForMovie() == nullptr,
		"ScoreScreen finishSinglePlayerInit non-final branch did not clear the blank layout pointer") && ok;
	ok = expect(campaign_manager.getCurrentMission() != nullptr &&
		campaign_manager.getCurrentMission()->m_name.compare(AsciiString("mission2")) == 0,
		"ScoreScreen finishSinglePlayerInit non-final branch did not advance to mission2") && ok;
	ok = expect(campaign_manager.getCurrentMap().compare(AsciiString("Maps/Smoke/Next.map")) == 0,
		"ScoreScreen finishSinglePlayerInit non-final branch did not leave the next map selected") && ok;
	ok = expect(CncPortScoreScreenGetMissionSaveCallsForMovie() == 1,
		"ScoreScreen finishSinglePlayerInit non-final branch did not call GameState::missionSave once") && ok;
	ok = expect(CncPortScoreScreenGetFreeMessageResourcesCallsForMovie() == 1,
		"ScoreScreen finishSinglePlayerInit non-final branch did not call InGameUI::freeMessageResources once") && ok;
	ok = expect(CncPortScoreScreenGetTransitionGroupCallsForMovie() == 1 &&
		std::strcmp(CncPortScoreScreenGetLastTransitionGroupForMovie(), "ScoreScreenShow") == 0,
		"ScoreScreen finishSinglePlayerInit non-final branch did not request ScoreScreenShow transition") && ok;
	ok = expect(static_text_game_saved == nullptr || !static_text_game_saved->winIsHidden(),
		"ScoreScreen finishSinglePlayerInit non-final branch did not reveal the saved-game text") && ok;
	ok = expect(button_ok == nullptr || !button_ok->winIsHidden(),
		"ScoreScreen finishSinglePlayerInit non-final branch did not restore the ok button") && ok;
	ok = expect(button_continue == nullptr || !button_continue->winIsHidden(),
		"ScoreScreen finishSinglePlayerInit non-final branch did not restore the continue button") && ok;

	std::printf("ScoreScreen finishSinglePlayerInit non-final victory branch ok: missionSave=%d freeMessages=%d transition=%s currentMap=%s\n",
		CncPortScoreScreenGetMissionSaveCallsForMovie(),
		CncPortScoreScreenGetFreeMessageResourcesCallsForMovie(),
		CncPortScoreScreenGetLastTransitionGroupForMovie(),
		campaign_manager.getCurrentMap().str());

	CncPortScoreScreenSetFinishSinglePlayerWindowsForMovie(nullptr, nullptr, nullptr);
	CncPortScoreScreenSetSavedTextForMovie(nullptr);
	CncPortScoreScreenSetBlankLayoutForMovie(nullptr);
	if (score_parent != nullptr) {
		window_manager.winDestroy(score_parent);
		window_manager.update();
	}
	ok = expect(display_string_manager.free_count >= 1,
		"ScoreScreen finishSinglePlayerInit non-final branch did not release button display strings during window cleanup") && ok;

	TheCampaignManager = old_campaign_manager;
	TheDisplayStringManager = old_display_string_manager;
	TheGameText = old_game_text;
	TheNameKeyGenerator = old_name_key_generator;
	TheGameEngine = old_game_engine;
	TheWindowManager = old_window_manager;
	return ok;
}

bool exercise_single_player_load_screen_init(VideoPlayerInterface &player)
{
	bool ok = true;
	SmokeGameWindowManager window_manager;
	WindowVideoProbeDisplay display;
	SmokeGameEngine game_engine;
	NameKeyGenerator name_key_generator;
	SmokeGameText game_text;
	SmokeMouse mouse;
	ImageCollection image_collection;
	GameWindowManager *old_window_manager = TheWindowManager;
	Display *old_display = TheDisplay;
	GameEngine *old_game_engine = TheGameEngine;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	GameTextInterface *old_game_text = TheGameText;
	ImageCollection *old_mapped_image_collection = TheMappedImageCollection;
	Mouse *old_mouse = TheMouse;

	TheWindowManager = &window_manager;
	TheDisplay = &display;
	TheGameEngine = &game_engine;
	TheNameKeyGenerator = &name_key_generator;
	TheGameText = &game_text;
	TheMappedImageCollection = &image_collection;
	TheMouse = &mouse;
	name_key_generator.init();
	CncPortLoadScreenSetSinglePlayerMovieForTest("USA", "VS_small");
	ok = expect(std::strcmp(CncPortLoadScreenGetSinglePlayerMovieForTest(), "VS_small") == 0,
		"SinglePlayerLoadScreen movie test hook did not retain VS_small") && ok;

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const UINT creates_before_init = state->browser_texture_create_calls;
	const UINT updates_before_init = state->browser_texture_update_calls;
	const UINT releases_before_init = state->browser_texture_release_calls;
	const UINT draws_before_init = state->draw_indexed_primitive_calls;
	const Int expected_presented_frames = 70;
	display.setLoadScreenWindowListProbe(TRUE);
	{
		SinglePlayerLoadScreen load_screen;
		load_screen.init(nullptr);

		state = wasm_d3d8_get_state();
		GameWindow *load_screen_window = TheWindowManager->winGetWindowFromId(
			nullptr,
			TheNameKeyGenerator->nameToKey(AsciiString("SinglePlayerLoadScreen.wnd:ParentSinglePlayerLoadScreen")));
		ok = expect(window_manager.single_player_layout_script_creates == 1,
			"SinglePlayerLoadScreen::init did not load SinglePlayerLoadScreen.wnd") && ok;
		ok = expect(load_screen_window != nullptr,
			"SinglePlayerLoadScreen::init did not retain the load-screen parent window") && ok;
		ok = expect(game_engine.service_windows_calls == expected_presented_frames,
			"SinglePlayerLoadScreen::init did not service the OS once per presented frame") && ok;
		ok = expect(display.loadScreenPresentOk(),
			"SinglePlayerLoadScreen::init display draw presentation failed") && ok;
		ok = expect(display.loadScreenPresentCount() == expected_presented_frames,
			"SinglePlayerLoadScreen::init did not present the expected VS_small frames") && ok;
		ok = expect(state->browser_texture_create_calls == creates_before_init + 1,
			"SinglePlayerLoadScreen::init did not allocate one W3DVideoBuffer texture") && ok;
		ok = expect(state->browser_texture_update_calls == updates_before_init + 1 + expected_presented_frames,
			"SinglePlayerLoadScreen::init did not upload the initial texture plus decoded frames") && ok;
		ok = expect(state->draw_indexed_primitive_calls == draws_before_init + expected_presented_frames,
			"SinglePlayerLoadScreen::init did not draw every decoded frame") && ok;
		ok = expect(load_screen_window == nullptr || load_screen_window->winGetInstanceData()->m_videoBuffer == nullptr,
			"SinglePlayerLoadScreen::init did not detach the load-screen VideoBuffer") && ok;
		ok = expect(player.firstStream() == nullptr,
			"SinglePlayerLoadScreen::init did not close the owned Bink stream") && ok;
		ok = expect(state->last_browser_texture_width == next_power_of_two(96) &&
			state->last_browser_texture_height == next_power_of_two(120),
			"SinglePlayerLoadScreen::init decoded texture dimensions mismatch") && ok;
		ok = expect(state->last_browser_texture_pitch == next_power_of_two(96) * 4,
			"SinglePlayerLoadScreen::init decoded texture pitch mismatch") && ok;
		ok = expect(state->last_browser_texture_format == D3DFMT_X8R8G8B8,
			"SinglePlayerLoadScreen::init decoded texture format mismatch") && ok;
		ok = expect(state->last_browser_texture_checksum != 0,
			"SinglePlayerLoadScreen::init uploaded an all-zero decoded frame") && ok;

		std::printf("SinglePlayerLoadScreen init VS_small Bink W3D presentation ok: frames=%d texture=%ux%u pitch=%u checksum=%u drawRect=%d,%d,%d,%d\n",
			expected_presented_frames,
			next_power_of_two(96),
			next_power_of_two(120),
			next_power_of_two(96) * 4,
			static_cast<unsigned int>(state->last_browser_texture_checksum),
			112,
			84,
			208,
			204);
	}
	display.setLoadScreenWindowListProbe(FALSE);
	window_manager.update();
	state = wasm_d3d8_get_state();
	ok = expect(state->browser_texture_release_calls == releases_before_init + 1,
		"SinglePlayerLoadScreen destructor did not release the W3DVideoBuffer texture") && ok;
	ok = expect(window_manager.winGetWindowList() == nullptr,
		"SinglePlayerLoadScreen destructor did not destroy the load-screen window") && ok;

	TheMouse = old_mouse;
	TheMappedImageCollection = old_mapped_image_collection;
	TheGameText = old_game_text;
	TheNameKeyGenerator = old_name_key_generator;
	TheGameEngine = old_game_engine;
	TheDisplay = old_display;
	TheWindowManager = old_window_manager;
	return ok;
}

bool exercise_challenge_load_screen_init(VideoPlayerInterface &player)
{
	bool ok = true;
	SmokeGameWindowManager window_manager;
	WindowVideoProbeDisplay display;
	SmokeGameEngine game_engine;
	NameKeyGenerator name_key_generator;
	SmokeGameText game_text;
	SmokeMouse mouse;
	GameWindowManager *old_window_manager = TheWindowManager;
	Display *old_display = TheDisplay;
	GameEngine *old_game_engine = TheGameEngine;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	GameTextInterface *old_game_text = TheGameText;
	Mouse *old_mouse = TheMouse;

	TheWindowManager = &window_manager;
	TheDisplay = &display;
	TheGameEngine = &game_engine;
	TheNameKeyGenerator = &name_key_generator;
	TheGameText = &game_text;
	TheMouse = &mouse;
	name_key_generator.init();
	CncPortLoadScreenSetChallengeMovieForTest("GC_Background", "VS_small", "VS_small");
	ok = expect(std::strcmp(CncPortLoadScreenGetChallengeMovieForTest(), "GC_Background") == 0,
		"ChallengeLoadScreen movie test hook did not retain GC_Background") && ok;

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const UINT creates_before_init = state->browser_texture_create_calls;
	const UINT updates_before_init = state->browser_texture_update_calls;
	const UINT releases_before_init = state->browser_texture_release_calls;
	const UINT draws_before_init = state->draw_indexed_primitive_calls;
	const Int expected_background_frames = 179;
	const Int expected_window_movie_copies = 372;
	const Int expected_total_copies = expected_background_frames + expected_window_movie_copies;
	const Int expected_presented_buffers = 551;
	display.setLoadScreenWindowListProbe(TRUE, TRUE);
	{
		ChallengeLoadScreen load_screen;
		load_screen.init(nullptr);

		state = wasm_d3d8_get_state();
		GameWindow *load_screen_window = TheWindowManager->winGetWindowFromId(
			nullptr,
			TheNameKeyGenerator->nameToKey(AsciiString("ChallengeLoadScreen.wnd:ParentChallengeLoadScreen")));
		ok = expect(window_manager.challenge_layout_script_creates == 1,
			"ChallengeLoadScreen::init did not load ChallengeLoadScreen.wnd") && ok;
		ok = expect(load_screen_window != nullptr,
			"ChallengeLoadScreen::init did not retain the challenge load-screen parent window") && ok;
		ok = expect(load_screen_window == nullptr || load_screen_window->winGetInstanceData()->m_videoBuffer != nullptr,
			"ChallengeLoadScreen::init did not leave the background VideoBuffer attached before destruction") && ok;
		ok = expect(game_engine.service_windows_calls == expected_background_frames,
			"ChallengeLoadScreen::init did not service the OS once per background frame") && ok;
		ok = expect(display.loadScreenPresentOk(),
			"ChallengeLoadScreen::init display draw presentation failed") && ok;
		ok = expect(display.loadScreenPresentCount() == expected_presented_buffers,
			"ChallengeLoadScreen::init did not present the expected background plus managed child movie buffers") && ok;
		ok = expect(state->browser_texture_create_calls == creates_before_init + 4,
			"ChallengeLoadScreen::init did not allocate the background plus three managed movie textures") && ok;
		ok = expect(state->browser_texture_update_calls == updates_before_init + 4 + expected_total_copies,
			"ChallengeLoadScreen::init did not upload the initial textures plus decoded challenge frames") && ok;
		ok = expect(state->draw_indexed_primitive_calls == draws_before_init + expected_presented_buffers,
			"ChallengeLoadScreen::init did not draw every attached challenge video buffer") && ok;
		ok = expect(player.firstStream() != nullptr,
			"ChallengeLoadScreen::init should own open background/window streams until destruction") && ok;
		ok = expect(state->last_browser_texture_width == next_power_of_two(96) &&
			state->last_browser_texture_height == next_power_of_two(120),
			"ChallengeLoadScreen::init final managed movie texture dimensions mismatch") && ok;
		ok = expect(state->last_browser_texture_pitch == next_power_of_two(96) * 4,
			"ChallengeLoadScreen::init final managed movie texture pitch mismatch") && ok;
		ok = expect(state->last_browser_texture_format == D3DFMT_X8R8G8B8,
			"ChallengeLoadScreen::init decoded texture format mismatch") && ok;
		ok = expect(state->last_browser_texture_checksum != 0,
			"ChallengeLoadScreen::init uploaded an all-zero decoded frame") && ok;

		std::printf("ChallengeLoadScreen init GC_Background Bink W3D presentation ok: backgroundFrames=%d windowCopies=%d presentedBuffers=%d finalTexture=%ux%u pitch=%u checksum=%u\n",
			expected_background_frames,
			expected_window_movie_copies,
			expected_presented_buffers,
			next_power_of_two(96),
			next_power_of_two(120),
			next_power_of_two(96) * 4,
			static_cast<unsigned int>(state->last_browser_texture_checksum));
	}
	display.setLoadScreenWindowListProbe(FALSE);
	window_manager.update();
	state = wasm_d3d8_get_state();
	ok = expect(player.firstStream() == nullptr,
		"ChallengeLoadScreen destructor did not close the owned Bink streams") && ok;
	ok = expect(state->browser_texture_release_calls == releases_before_init + 4,
		"ChallengeLoadScreen destructor did not release the background plus managed movie textures") && ok;
	ok = expect(window_manager.winGetWindowList() == nullptr,
		"ChallengeLoadScreen destructor did not destroy the challenge load-screen window") && ok;

	TheMouse = old_mouse;
	TheGameText = old_game_text;
	TheNameKeyGenerator = old_name_key_generator;
	TheGameEngine = old_game_engine;
	TheDisplay = old_display;
	TheWindowManager = old_window_manager;
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
		add_video(*player, "VSSmall", "VS_small");

		ok = expect(player->getNumVideos() == 3, "BinkVideoPlayer video registration failed") && ok;
		ok = expect(WasmBinkProviderCanDecodeFrames() == 1,
			"Bink provider decode readiness must be true after installing the browser sidecar copy hook") && ok;
		ok = exercise_stream(*player, player->open(AsciiString("GC_Background")),
			"GC_Background", 800, 600, 180, 112, 84, 912, 684) && ok;
		ok = exercise_stream(*player, player->load(AsciiString("VS_small")),
			"VS_small", 96, 120, 71, 464, 324, 560, 444) && ok;
		ok = exercise_display_movie(*player) && ok;
		ok = exercise_window_video_manager(*player) && ok;
		ok = exercise_blank_layout_movie_path(*player) && ok;
		ok = exercise_score_screen_play_movie_and_block(*player) && ok;
		ok = exercise_score_screen_finish_single_player_final_movie(*player) && ok;
		ok = exercise_score_screen_finish_single_player_non_final_victory() && ok;
		ok = exercise_single_player_load_screen_init(*player) && ok;
		ok = exercise_challenge_load_screen_init(*player) && ok;
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
