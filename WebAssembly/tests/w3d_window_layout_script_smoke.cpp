#include <algorithm>
#include <cctype>
#include <cstring>
#include <iostream>
#include <string>
#include <vector>

#include "PreRTS.h"

// Original headers use "= NULL" for pure virtual declarations.
#ifdef NULL
#undef NULL
#endif
#define NULL 0

#include "Common/AudioEventRTS.h"
#include "Common/AudioHandleSpecialValues.h"
#include "Common/File.h"
#include "Common/FileSystem.h"
#include "Common/FunctionLexicon.h"
#include "Common/GameAudio.h"
#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/INI.h"
#include "Common/LocalFileSystem.h"
#include "Common/NameKeyGenerator.h"
#include "Common/SubsystemInterface.h"
#include "Common/UserPreferences.h"
#include "Common/ArchiveFileSystem.h"
#include "GameClient/Display.h"
#include "GameClient/DisplayStringManager.h"
#include "GameClient/CampaignManager.h"
#include "GameClient/Credits.h"
#include "GameClient/ExtendedMessageBox.h"
#include "GameClient/GameFont.h"
#include "GameClient/GameText.h"
#include "GameClient/GameWindow.h"
#include "GameClient/GameWindowManager.h"
#include "GameClient/GlobalLanguage.h"
#include "GameClient/HeaderTemplate.h"
#include "GameClient/Image.h"
#include "GameClient/Keyboard.h"
#include "GameClient/MapUtil.h"
#include "GameClient/Mouse.h"
#include "GameClient/SelectionXlat.h"
#include "GameClient/Shell.h"
#include "GameClient/ShellHooks.h"
#include "GameClient/WinInstanceData.h"
#include "GameClient/WindowLayout.h"
#include "GameClient/GameWindowTransitions.h"
#include "GameLogic/GameLogic.h"
#include "GameLogic/ScriptEngine.h"
#include "GameNetwork/DownloadManager.h"
#include "W3DDevice/Common/W3DFunctionLexicon.h"
#include "Win32Device/Common/Win32BIGFileSystem.h"
#include "Win32Device/Common/Win32LocalFileSystem.h"

class CampaignManager;
class ChallengeGenerals;
class DownloadManager;
class GameClient;
class GameEngine;
class DisplayStringManager;
class GameTextInterface;
class GlobalLanguage;
class IMEManagerInterface;
class ImageCollection;
class InGameUI;
class Keyboard;
class MapCache;
class SelectionTranslator;
class ScriptEngine;
class VideoPlayerInterface;
class View;
class GameSpyPeerMessageQueueInterface;
class GameSpyInfoInterface;
void W3DMainMenuInit(WindowLayout *layout, void *userData);
void MainMenuInit(WindowLayout *layout, void *userData);
void MainMenuUpdate(WindowLayout *layout, void *userData);
void MainMenuShutdown(WindowLayout *layout, void *userData);
void CreditsMenuInit(WindowLayout *layout, void *userData);
void CreditsMenuUpdate(WindowLayout *layout, void *userData);
void CreditsMenuShutdown(WindowLayout *layout, void *userData);
WindowMsgHandledType MainMenuSystem(GameWindow *window, UnsignedInt msg,
	WindowMsgData mData1, WindowMsgData mData2);
WindowMsgHandledType CreditsMenuInput(GameWindow *window, UnsignedInt msg,
	WindowMsgData mData1, WindowMsgData mData2);
WindowMsgHandledType CreditsMenuSystem(GameWindow *window, UnsignedInt msg,
	WindowMsgData mData1, WindowMsgData mData2);
WindowMsgHandledType MessageBoxSystem(GameWindow *window, UnsignedInt msg,
	WindowMsgData mData1, WindowMsgData mData2);
WindowMsgHandledType QuitMessageBoxSystem(GameWindow *window, UnsignedInt msg,
	WindowMsgData mData1, WindowMsgData mData2);

GlobalData *TheGlobalData = nullptr;
SubsystemInterfaceList *TheSubsystemList = nullptr;
AudioManager *TheAudio = nullptr;
GameLogic *TheGameLogic = nullptr;
GameTextInterface *TheGameText = nullptr;
GlobalLanguage *TheGlobalLanguageData = nullptr;
IMEManagerInterface *TheIMEManager = nullptr;
ImageCollection *TheMappedImageCollection = nullptr;
InGameUI *TheInGameUI = nullptr;
Keyboard *TheKeyboard = nullptr;
CampaignManager *TheCampaignManager = nullptr;
ChallengeGenerals *TheChallengeGenerals = nullptr;
DownloadManager *TheDownloadManager = nullptr;
GameClient *TheGameClient = nullptr;
GameEngine *TheGameEngine = nullptr;
GameSpyPeerMessageQueueInterface *TheGameSpyPeerMessageQueue = nullptr;
MapCache *TheMapCache = nullptr;
SelectionTranslator *TheSelectionTranslator = nullptr;
ScriptEngine *TheScriptEngine = nullptr;
VideoPlayerInterface *TheVideoPlayer = nullptr;
View *TheTacticalView = nullptr;
GameSpyInfoInterface *TheGameSpyInfo = nullptr;
GameWindowTransitionsHandler *TheTransitionHandler = nullptr;
Bool DontShowMainMenu = FALSE;
Bool dispChanged = FALSE;
DisplaySettings oldDispSettings = {800, 600, 32, TRUE};
DisplaySettings newDispSettings = {800, 600, 32, TRUE};
char *TheShellHookNames[SHELL_SCRIPT_HOOK_TOTAL] = {};
HWND ApplicationHWnd = NULL;
const Char *g_strFile = "Data\\Generals.str";
const Char *g_csfFile = "Data\\%s\\Generals.csf";

namespace {

Int g_mouse_visibility_true_calls = 0;
Int g_mouse_visibility_false_calls = 0;
Int g_raise_gs_message_box_calls = 0;
Int g_http_think_wrapper_calls = 0;
Int g_game_spy_update_overlays_calls = 0;
Int g_download_update_calls = 0;
Int g_transition_set_group_calls = 0;
Int g_transition_is_finished_calls = 0;
Int g_transition_reverse_calls = 0;
Int g_transition_remove_calls = 0;
AsciiString g_last_transition_group;
AsciiString g_last_transition_reverse_group;
AsciiString g_last_transition_remove_group;

std::string normalized_path(const Char *path)
{
	std::string result = path != nullptr ? path : "";
	std::replace(result.begin(), result.end(), '/', '\\');
	std::transform(result.begin(), result.end(), result.begin(),
		[](unsigned char ch) { return static_cast<char>(std::tolower(ch)); });
	return result;
}

WindowMsgData center_click_data(GameWindow *window)
{
	Int x = 0;
	Int y = 0;
	Int width = 0;
	Int height = 0;
	window->winGetScreenPosition(&x, &y);
	window->winGetSize(&width, &height);
	return SHORTTOLONG(x + width / 2, y + height / 2);
}

class MemoryScriptFile : public File
{
public:
	void setPayload(const std::string &payload)
	{
		m_data.assign(payload.begin(), payload.end());
		m_pos = 0;
	}

	Bool open(const Char *filename, Int access = 0) override
	{
		m_pos = 0;
		return File::open(filename, access);
	}

	Int read(void *buffer, Int bytes) override
	{
		if (bytes <= 0) {
			return 0;
		}
		const Int remaining = static_cast<Int>(m_data.size()) - m_pos;
		const Int bytes_to_read = remaining <= 0 ? 0 : (bytes < remaining ? bytes : remaining);
		if (bytes_to_read > 0 && buffer != nullptr) {
			std::memcpy(buffer, m_data.data() + m_pos, static_cast<std::size_t>(bytes_to_read));
		}
		m_pos += bytes_to_read;
		return bytes_to_read;
	}

	Int write(const void *, Int) override { return -1; }

	Int seek(Int bytes, seekMode mode = CURRENT) override
	{
		Int base = 0;
		if (mode == CURRENT) {
			base = m_pos;
		} else if (mode == END) {
			base = static_cast<Int>(m_data.size());
		}
		const Int next = base + bytes;
		m_pos = next < 0 ? 0 : (next > static_cast<Int>(m_data.size()) ? static_cast<Int>(m_data.size()) : next);
		return m_pos;
	}

	void nextLine(Char *buf = nullptr, Int bufSize = 0) override
	{
		Int i = 0;
		while (m_pos < static_cast<Int>(m_data.size()) && m_data[static_cast<std::size_t>(m_pos)] != '\n') {
			if (buf != nullptr && i < bufSize - 1) {
				buf[i++] = m_data[static_cast<std::size_t>(m_pos)];
			}
			++m_pos;
		}
		if (m_pos < static_cast<Int>(m_data.size())) {
			if (buf != nullptr && i < bufSize - 1) {
				buf[i++] = m_data[static_cast<std::size_t>(m_pos)];
			}
			++m_pos;
		}
		if (buf != nullptr && bufSize > 0) {
			buf[i < bufSize ? i : bufSize - 1] = 0;
		}
	}

	Bool scanInt(Int &newInt) override
	{
		while (m_pos < static_cast<Int>(m_data.size())
			&& !std::isdigit(static_cast<unsigned char>(m_data[static_cast<std::size_t>(m_pos)]))
			&& m_data[static_cast<std::size_t>(m_pos)] != '-') {
			++m_pos;
		}
		if (m_pos >= static_cast<Int>(m_data.size())) {
			return FALSE;
		}
		std::string token;
		do {
			token.push_back(m_data[static_cast<std::size_t>(m_pos++)]);
		} while (m_pos < static_cast<Int>(m_data.size())
			&& std::isdigit(static_cast<unsigned char>(m_data[static_cast<std::size_t>(m_pos)])));
		newInt = std::atoi(token.c_str());
		return TRUE;
	}

	Bool scanReal(Real &newReal) override
	{
		Int value = 0;
		if (!scanInt(value)) {
			return FALSE;
		}
		newReal = static_cast<Real>(value);
		return TRUE;
	}

	Bool scanString(AsciiString &newString) override
	{
		newString.clear();
		while (m_pos < static_cast<Int>(m_data.size())
			&& std::isspace(static_cast<unsigned char>(m_data[static_cast<std::size_t>(m_pos)]))) {
			++m_pos;
		}
		if (m_pos >= static_cast<Int>(m_data.size())) {
			return FALSE;
		}
		do {
			newString.concat(m_data[static_cast<std::size_t>(m_pos++)]);
		} while (m_pos < static_cast<Int>(m_data.size())
			&& !std::isspace(static_cast<unsigned char>(m_data[static_cast<std::size_t>(m_pos)])));
		return TRUE;
	}

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
	Int m_pos = 0;
};

class ScriptLocalFileSystem : public LocalFileSystem
{
public:
	explicit ScriptLocalFileSystem(const std::string &payload) : m_payload(payload) {}

	void init() override {}
	void reset() override {}
	void update() override {}

	File *openFile(const Char *filename, Int access = 0) override
	{
		if (normalized_path(filename) != "window\\menus\\blankwindow.wnd") {
			return nullptr;
		}
		m_file.close();
		m_file.setPayload(m_payload);
		return m_file.open(filename, access) ? &m_file : nullptr;
	}

	Bool doesFileExist(const Char *filename) const override
	{
		return normalized_path(filename) == "window\\menus\\blankwindow.wnd";
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
	std::string m_payload;
	MemoryScriptFile m_file;
};

class SmokeGameWindow : public GameWindow
{
	MEMORY_POOL_GLUE_WITH_EXPLICIT_CREATE(SmokeGameWindow, "SmokeGameWindow", 1, 1)

public:
	SmokeGameWindow() = default;
	void winDrawBorder() override {}
};

EMPTY_DTOR(SmokeGameWindow)

void SmokeNoDraw(GameWindow *, WinInstanceData *)
{
}

class SmokeGameWindowManager : public GameWindowManager
{
public:
	GameWindow *allocateNewWindow() override { return newInstance(SmokeGameWindow); }
	GameWinDrawFunc getPushButtonImageDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getPushButtonDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getCheckBoxImageDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getCheckBoxDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getRadioButtonImageDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getRadioButtonDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getTabControlImageDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getTabControlDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getListBoxImageDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getListBoxDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getComboBoxImageDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getComboBoxDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getHorizontalSliderImageDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getHorizontalSliderDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getVerticalSliderImageDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getVerticalSliderDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getProgressBarImageDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getProgressBarDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getStaticTextImageDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getStaticTextDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getTextEntryImageDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getTextEntryDrawFunc() override { return SmokeNoDraw; }
	GameFont *winFindFont(AsciiString font_name, Int point_size, Bool bold) override
	{
		return TheFontLibrary != nullptr ? TheFontLibrary->getFont(font_name, point_size, bold) : nullptr;
	}
};

class SmokeFontLibrary : public FontLibrary
{
protected:
	Bool loadFontData(GameFont *font) override
	{
		if (font == nullptr) {
			return FALSE;
		}
		font->height = font->pointSize;
		font->fontData = nullptr;
		return TRUE;
	}
};

class SmokeDisplayString : public DisplayString
{
	MEMORY_POOL_GLUE_WITH_EXPLICIT_CREATE(SmokeDisplayString, "SmokeDisplayString", 1, 1)

public:
	void setWordWrap(Int wordWrap) override { m_wordWrap = wordWrap; }
	void setWordWrapCentered(Bool isCentered) override { m_wordWrapCentered = isCentered; }
	void draw(Int, Int, Color, Color) override {}
	void draw(Int, Int, Color, Color, Int, Int) override {}
	void getSize(Int *width, Int *height) override
	{
		if (width != nullptr) {
			*width = getWidth();
		}
		if (height != nullptr) {
			*height = m_font != nullptr ? m_font->height : 0;
		}
	}
	Int getWidth(Int charPos = -1) override
	{
		const Int text_length = m_textString.getLength();
		const Int chars = charPos >= 0 && charPos < text_length ? charPos : text_length;
		return chars * 8;
	}
	void setUseHotkey(Bool, Color) override {}

private:
	Int m_wordWrap = 0;
	Bool m_wordWrapCentered = FALSE;
};

EMPTY_DTOR(SmokeDisplayString)

class SmokeDisplayStringManager : public DisplayStringManager
{
public:
	DisplayString *newDisplayString() override
	{
		DisplayString *string = newInstance(SmokeDisplayString);
		link(string);
		return string;
	}

	void freeDisplayString(DisplayString *string) override
	{
		if (string == nullptr) {
			return;
		}
		unLink(string);
		string->deleteInstance();
	}

	DisplayString *getGroupNumeralString(Int) override { return newDisplayString(); }
	DisplayString *getFormationLetterString() override { return newDisplayString(); }
};

class SmokeGameText : public GameTextInterface
{
public:
	void init() override {}
	void reset() override {}
	void update() override {}

	UnicodeString fetch(const Char *label, Bool *exists = nullptr) override
	{
		if (exists != nullptr) {
			*exists = TRUE;
		}
		UnicodeString text;
		text.translate(label != nullptr ? label : "");
		return text;
	}

	UnicodeString fetch(AsciiString label, Bool *exists = nullptr) override
	{
		return fetch(label.str(), exists);
	}

	AsciiStringVec &getStringsWithLabelPrefix(AsciiString) override { return m_empty; }
	void initMapStringFile(const AsciiString &) override {}

private:
	AsciiStringVec m_empty;
};

class SmokeMouse : public Mouse
{
public:
	void initCursorResources() override {}
	void setCursor(MouseCursor cursor) override { m_currentCursor = cursor; }
	void setVisibility(Bool visible) override
	{
		if (visible) {
			++g_mouse_visibility_true_calls;
		} else {
			++g_mouse_visibility_false_calls;
		}
		Mouse::setVisibility(visible);
	}
	void capture() override {}
	void releaseCapture() override {}

protected:
	UnsignedByte getMouseEvent(MouseIO *, Bool) override { return MOUSE_EVENT_NONE; }
};

class SmokeAudioManager final : public AudioManager
{
public:
#if defined(_DEBUG) || defined(_INTERNAL)
	void audioDebugDisplay(DebugDisplayInterface *, void *, FILE * = NULL) override {}
#endif
	void stopAudio(AudioAffect) override {}
	void pauseAudio(AudioAffect) override {}
	void resumeAudio(AudioAffect) override {}
	void pauseAmbient(Bool) override {}
	AudioHandle addAudioEvent(const AudioEventRTS *event_to_add) override
	{
		++add_audio_event_calls;
		last_audio_event_name = event_to_add != nullptr ? event_to_add->getEventName() : AsciiString::TheEmptyString;
		return next_audio_handle++;
	}
	void removeAudioEvent(AudioHandle audio_event) override
	{
		++remove_audio_event_calls;
		last_removed_audio_event = audio_event;
	}
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
	AsciiString getProviderName(UnsignedInt) const override { return AsciiString("w3d-shell-smoke"); }
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
	void *getHandleForBink() override { return nullptr; }
	void releaseHandleForBink() override {}
	void friend_forcePlayAudioEventRTS(const AudioEventRTS *) override {}
	void setPreferredProvider(AsciiString) override {}
	void setPreferredSpeaker(AsciiString) override {}
	Real getFileLengthMS(AsciiString) const override { return 0.0f; }
	void closeAnySamplesUsingFile(const void *) override {}

	Int add_audio_event_calls = 0;
	Int remove_audio_event_calls = 0;
	AudioHandle last_removed_audio_event = AHSV_NoSound;
	AsciiString last_audio_event_name;

protected:
	void setDeviceListenerPosition() override {}

private:
	AudioHandle next_audio_handle = 1;
};

class SmokeDisplay : public Display
{
public:
	void doSmartAssetPurgeAndPreload(const char *) override {}
#if defined(_DEBUG) || defined(_INTERNAL)
	void dumpAssetUsage(const char *) override {}
#endif
	VideoBuffer *createVideoBuffer() override { return nullptr; }
	void setClipRegion(IRegion2D *region) override
	{
		if (region != nullptr) {
			m_clipRegion = *region;
		}
	}
	Bool isClippingEnabled() override { return m_clippingEnabled; }
	void enableClipping(Bool onoff) override { m_clippingEnabled = onoff; }
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
	void clearShroud() override {}
	void setShroudLevel(Int, Int, CellShroudStatus) override {}
	void setBorderShroudLevel(UnsignedByte) override {}
#if defined(_DEBUG) || defined(_INTERNAL)
	void dumpModelAssets(const char *) override {}
#endif
	void preloadModelAssets(AsciiString) override {}
	void preloadTextureAssets(AsciiString) override {}
	void takeScreenShot() override {}
	void toggleMovieCapture() override {}
	void toggleLetterBox() override {}
	void enableLetterBox(Bool enable) override { m_letterBoxEnabled = enable; }
	Real getAverageFPS() override { return 0.0f; }
	Int getLastFrameDrawCalls() override { return 0; }

private:
	IRegion2D m_clipRegion = { { 0, 0 }, { 0, 0 } };
	Bool m_clippingEnabled = FALSE;
};

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

void split_archive_path(const char *archive_path, AsciiString &directory, AsciiString &file_mask)
{
	std::string normalized = archive_path != nullptr ? archive_path : "";
	std::replace(normalized.begin(), normalized.end(), '\\', '/');

	const std::size_t slash = normalized.find_last_of('/');
	if (slash == std::string::npos) {
		directory = "";
		file_mask = normalized.c_str();
		return;
	}

	directory = normalized.substr(0, slash + 1).c_str();
	file_mask = normalized.substr(slash + 1).c_str();
}

const char *blank_window_script()
{
	return
		"FILE_VERSION = 2\n"
		"STARTLAYOUTBLOCK\n"
		"LAYOUTINIT = W3DMainMenuInit;\n"
		"LAYOUTUPDATE = [None];\n"
		"LAYOUTSHUTDOWN = [None];\n"
		"ENDLAYOUTBLOCK\n"
		"WINDOW\n"
		"WINDOWTYPE = USER;\n"
		"SCREENRECT = UPPERLEFT: 0 0 BOTTOMRIGHT: 800 600 CREATIONRESOLUTION: 800 600;\n"
		"NAME = \"BlankWindow.wnd:Root\";\n"
		"STATUS = ENABLED;\n"
		"STYLE = USER;\n"
		"END\n";
}

bool exercise_w3d_layout_script()
{
	bool ok = true;

	GlobalData global_data;
	SubsystemInterfaceList subsystem_list;
	NameKeyGenerator name_key_generator;
	FileSystem file_system;
	ScriptLocalFileSystem local_file_system(blank_window_script());
	SmokeDisplay display;
	SmokeFontLibrary font_library;
	SmokeDisplayStringManager display_string_manager;
	SmokeGameText game_text;
	HeaderTemplateManager header_templates;
	SmokeGameWindowManager window_manager;
	W3DFunctionLexicon function_lexicon;

	GlobalData *old_global_data = TheGlobalData;
	SubsystemInterfaceList *old_subsystem_list = TheSubsystemList;
	NameKeyGenerator *old_name_keys = TheNameKeyGenerator;
	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	Display *old_display = TheDisplay;
	FontLibrary *old_font_library = TheFontLibrary;
	DisplayStringManager *old_display_string_manager = TheDisplayStringManager;
	GameTextInterface *old_game_text = TheGameText;
	HeaderTemplateManager *old_header_templates = TheHeaderTemplateManager;
	GameWindowManager *old_window_manager = TheWindowManager;
	FunctionLexicon *old_function_lexicon = TheFunctionLexicon;

	TheGlobalData = &global_data;
	TheSubsystemList = &subsystem_list;
	TheNameKeyGenerator = &name_key_generator;
	TheFileSystem = &file_system;
	TheLocalFileSystem = &local_file_system;
	TheDisplay = &display;
	TheFontLibrary = &font_library;
	TheDisplayStringManager = &display_string_manager;
	TheGameText = &game_text;
	TheHeaderTemplateManager = &header_templates;
	TheWindowManager = &window_manager;
	TheFunctionLexicon = &function_lexicon;

	display.setWidth(800);
	display.setHeight(600);
	display.setBitDepth(32);
	display.setWindowed(TRUE);
	name_key_generator.init();
	function_lexicon.init();

	const NameKeyType w3d_init_key = TheNameKeyGenerator->nameToKey(AsciiString("W3DMainMenuInit"));
	ok = expect(TheFunctionLexicon->winLayoutInitFunc(w3d_init_key) == W3DMainMenuInit,
		"W3DFunctionLexicon did not expose W3DMainMenuInit through the device layout-init table") && ok;

	WindowLayout *layout = TheWindowManager->winCreateLayout(AsciiString("Menus/BlankWindow.wnd"));
	GameWindow *root = layout != nullptr ? layout->getFirstWindow() : nullptr;
	ok = expect(layout != nullptr,
		"WindowLayout::load did not create a layout through real winCreateFromScript") && ok;
	ok = expect(root != nullptr,
		"real .wnd parser did not create a root GameWindow") && ok;
	if (layout != nullptr) {
		ok = expect(layout->getFilename() == AsciiString("Menus/BlankWindow.wnd"),
			"WindowLayout did not retain the loaded filename") && ok;
	}
	if (root != nullptr) {
		Int x = -1;
		Int y = -1;
		Int width = -1;
		Int height = -1;
		root->winGetScreenPosition(&x, &y);
		root->winGetSize(&width, &height);
		ok = expect(root->winGetLayout() == layout,
			"WindowLayout::load did not attach the root window back to the layout") && ok;
		ok = expect(root->winGetWindowId() == TheNameKeyGenerator->nameToKey(AsciiString("BlankWindow.wnd:Root")),
			"parseName did not assign the expected NameKey window id") && ok;
		ok = expect(x == 0 && y == 0 && width == 800 && height == 600,
			"parseScreenRect did not create the expected root geometry") && ok;
		ok = expect(BitTest(root->winGetStatus(), WIN_STATUS_ENABLED),
			"parseStatus did not preserve WIN_STATUS_ENABLED") && ok;
	}

	if (layout != nullptr) {
		layout->destroyWindows();
		layout->deleteInstance();
	}
	window_manager.update();
	ok = expect(window_manager.winGetWindowList() == nullptr,
		"destroying the parsed layout should clear the original window list") && ok;

	TheFunctionLexicon = old_function_lexicon;
	TheWindowManager = old_window_manager;
	TheHeaderTemplateManager = old_header_templates;
	TheGameText = old_game_text;
	TheDisplayStringManager = old_display_string_manager;
	TheFontLibrary = old_font_library;
	TheDisplay = old_display;
	TheLocalFileSystem = old_local_file_system;
	TheFileSystem = old_file_system;
	TheNameKeyGenerator = old_name_keys;
	TheSubsystemList = old_subsystem_list;
	TheGlobalData = old_global_data;

	return ok;
}

struct ExpectedArchiveLayout
{
	const char *layout_path;
	const char *root_name;
	const char *parent_name;
	const char *ok_button_name;
	GameWinSystemFunc root_system;
};

bool verify_archive_layout(const ExpectedArchiveLayout &expected)
{
	bool ok = true;
	WindowLayout *layout = TheWindowManager->winCreateLayout(AsciiString(expected.layout_path));
	GameWindow *root = layout != nullptr ? layout->getFirstWindow() : nullptr;
	ok = expect(layout != nullptr,
		"WindowZH.big layout did not load through WindowLayout::load") && ok;
	ok = expect(root != nullptr,
		"WindowZH.big layout did not create a root GameWindow") && ok;

	if (layout != nullptr) {
		ok = expect(layout->getFilename() == AsciiString(expected.layout_path),
			"WindowLayout did not retain the real archive layout filename") && ok;
	}

	if (root != nullptr) {
		ok = expect(root->winGetLayout() == layout,
			"real archive root window was not attached back to the layout") && ok;
		ok = expect(root->winGetWindowId() == TheNameKeyGenerator->nameToKey(AsciiString(expected.root_name)),
			"real archive root window did not receive its script NameKey") && ok;
		ok = expect(root->winGetSystemFunc() == expected.root_system,
			"real archive root window did not resolve to the original message-box system callback") && ok;
		ok = expect(root->winGetInputFunc() == GameWinDefaultInput,
			"[None] input callback did not fall back to the original default input callback") && ok;
		ok = expect(root->winGetDrawFunc() == GameWinDefaultDraw,
			"[None] draw callback did not fall back to the original default draw callback") && ok;

		GameWindow *parent = TheWindowManager->winGetWindowFromId(
			root, TheNameKeyGenerator->nameToKey(AsciiString(expected.parent_name)));
		GameWindow *ok_button = TheWindowManager->winGetWindowFromId(
			root, TheNameKeyGenerator->nameToKey(AsciiString(expected.ok_button_name)));
		ok = expect(parent != nullptr,
			"real archive layout did not create the expected MessageBoxParent child") && ok;
		ok = expect(ok_button != nullptr,
			"real archive layout did not create the expected ButtonOk child") && ok;
		if (parent != nullptr) {
			ok = expect(parent->winGetSystemFunc() == PassMessagesToParentSystem,
				"MessageBoxParent did not resolve PassMessagesToParentSystem from the original GUI lexicon") && ok;
		}
		if (ok_button != nullptr) {
			ok = expect(BitTest(ok_button->winGetStatus(), WIN_STATUS_HIDDEN),
				"real message-box ButtonOk did not preserve the hidden startup status from WindowZH.big") && ok;
		}

		Bool wants_focus = FALSE;
		const WindowMsgHandledType focus_result = root->winGetSystemFunc()(
			root, GWM_INPUT_FOCUS, TRUE, reinterpret_cast<WindowMsgData>(&wants_focus));
		ok = expect(focus_result == MSG_HANDLED && wants_focus == TRUE,
			"original message-box system callback did not execute its input-focus path") && ok;
	}

	if (layout != nullptr) {
		layout->destroyWindows();
		layout->deleteInstance();
	}
	TheWindowManager->update();
	ok = expect(TheWindowManager->winGetWindowList() == nullptr,
		"destroying the real archive layout should clear the original window list") && ok;

	return ok;
}

bool exercise_w3d_archive_layout_script(const char *archive_path)
{
	bool ok = true;
	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (!expect(archive_mask.isNotEmpty(), "WindowZH.big archive file mask is empty")) {
		return false;
	}

	GlobalData global_data;
	SubsystemInterfaceList subsystem_list;
	NameKeyGenerator name_key_generator;
	Win32LocalFileSystem local_file_system;
	FileSystem file_system;
	Win32BIGFileSystem archive_file_system;
	SmokeDisplay display;
	SmokeFontLibrary font_library;
	SmokeDisplayStringManager display_string_manager;
	SmokeGameText game_text;
	HeaderTemplateManager header_templates;
	SmokeGameWindowManager window_manager;
	W3DFunctionLexicon function_lexicon;

	GlobalData *old_global_data = TheGlobalData;
	SubsystemInterfaceList *old_subsystem_list = TheSubsystemList;
	NameKeyGenerator *old_name_keys = TheNameKeyGenerator;
	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	Display *old_display = TheDisplay;
	FontLibrary *old_font_library = TheFontLibrary;
	DisplayStringManager *old_display_string_manager = TheDisplayStringManager;
	GameTextInterface *old_game_text = TheGameText;
	HeaderTemplateManager *old_header_templates = TheHeaderTemplateManager;
	GameWindowManager *old_window_manager = TheWindowManager;
	FunctionLexicon *old_function_lexicon = TheFunctionLexicon;

	TheGlobalData = &global_data;
	TheSubsystemList = &subsystem_list;
	TheNameKeyGenerator = &name_key_generator;
	TheLocalFileSystem = &local_file_system;
	TheArchiveFileSystem = &archive_file_system;
	TheFileSystem = &file_system;
	TheDisplay = &display;
	TheFontLibrary = &font_library;
	TheDisplayStringManager = &display_string_manager;
	TheGameText = &game_text;
	TheHeaderTemplateManager = &header_templates;
	TheWindowManager = &window_manager;
	TheFunctionLexicon = &function_lexicon;

	display.setWidth(800);
	display.setHeight(600);
	display.setBitDepth(32);
	display.setWindowed(TRUE);
	name_key_generator.init();
	function_lexicon.init();

	ok = expect(archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask),
		"Win32BIGFileSystem did not load WindowZH.big") && ok;
	ok = expect(file_system.doesFileExist("Window\\Menus\\MessageBox.wnd"),
		"WindowZH.big did not expose MessageBox.wnd through FileSystem") && ok;
	ok = expect(file_system.doesFileExist("Window\\Menus\\QuitMessageBox.wnd"),
		"WindowZH.big did not expose QuitMessageBox.wnd through FileSystem") && ok;

	ok = expect(TheFunctionLexicon->gameWinSystemFunc(
			TheNameKeyGenerator->nameToKey(AsciiString("MessageBoxSystem"))) == MessageBoxSystem,
		"FunctionLexicon did not resolve MessageBoxSystem to the original callback owner") && ok;
	ok = expect(TheFunctionLexicon->gameWinSystemFunc(
			TheNameKeyGenerator->nameToKey(AsciiString("QuitMessageBoxSystem"))) == QuitMessageBoxSystem,
		"FunctionLexicon did not resolve QuitMessageBoxSystem to the original callback owner") && ok;

	const ExpectedArchiveLayout message_box = {
		"Menus/MessageBox.wnd",
		"MessageBox.wnd:",
		"MessageBox.wnd:MessageBoxParent",
		"MessageBox.wnd:ButtonOk",
		MessageBoxSystem
	};
	const ExpectedArchiveLayout quit_message_box = {
		"Menus/QuitMessageBox.wnd",
		"QuitMessageBox.wnd:",
		"QuitMessageBox.wnd:MessageBoxParent",
		"QuitMessageBox.wnd:ButtonOk",
		QuitMessageBoxSystem
	};
	ok = verify_archive_layout(message_box) && ok;
	ok = verify_archive_layout(quit_message_box) && ok;

	TheFunctionLexicon = old_function_lexicon;
	TheWindowManager = old_window_manager;
	TheHeaderTemplateManager = old_header_templates;
	TheGameText = old_game_text;
	TheDisplayStringManager = old_display_string_manager;
	TheFontLibrary = old_font_library;
	TheDisplay = old_display;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;
	TheNameKeyGenerator = old_name_keys;
	TheSubsystemList = old_subsystem_list;
	TheGlobalData = old_global_data;

	return ok;
}

bool exercise_w3d_shell_main_menu_push(const char *archive_path)
{
	bool ok = true;
	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (!expect(archive_mask.isNotEmpty(), "WindowZH.big archive file mask is empty for shell push")) {
		return false;
	}

	GlobalData global_data;
	SubsystemInterfaceList subsystem_list;
	NameKeyGenerator name_key_generator;
	Win32LocalFileSystem local_file_system;
	FileSystem file_system;
	Win32BIGFileSystem archive_file_system;
	SmokeDisplay display;
	SmokeFontLibrary font_library;
	SmokeDisplayStringManager display_string_manager;
	SmokeGameText game_text;
	GlobalLanguage global_language;
	GameLogic game_logic;
	SmokeMouse mouse;
	SmokeAudioManager audio;
	HeaderTemplateManager header_templates;
	GameWindowTransitionsHandler transition_handler;
	SmokeGameWindowManager window_manager;
	W3DFunctionLexicon function_lexicon;

	GlobalData *old_global_data = TheGlobalData;
	SubsystemInterfaceList *old_subsystem_list = TheSubsystemList;
	NameKeyGenerator *old_name_keys = TheNameKeyGenerator;
	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	Display *old_display = TheDisplay;
	FontLibrary *old_font_library = TheFontLibrary;
	DisplayStringManager *old_display_string_manager = TheDisplayStringManager;
	GameTextInterface *old_game_text = TheGameText;
	GlobalLanguage *old_global_language = TheGlobalLanguageData;
	GameLogic *old_game_logic = TheGameLogic;
	AudioManager *old_audio = TheAudio;
	DownloadManager *old_download_manager = TheDownloadManager;
	Mouse *old_mouse = TheMouse;
	HeaderTemplateManager *old_header_templates = TheHeaderTemplateManager;
	GameWindowTransitionsHandler *old_transition_handler = TheTransitionHandler;
	GameWindowManager *old_window_manager = TheWindowManager;
	FunctionLexicon *old_function_lexicon = TheFunctionLexicon;
	Shell *old_shell = TheShell;

	TheGlobalData = &global_data;
	TheSubsystemList = &subsystem_list;
	TheNameKeyGenerator = &name_key_generator;
	TheLocalFileSystem = &local_file_system;
	TheArchiveFileSystem = &archive_file_system;
	TheFileSystem = &file_system;
	TheDisplay = &display;
	TheFontLibrary = &font_library;
	TheDisplayStringManager = &display_string_manager;
	TheGameText = &game_text;
	TheGlobalLanguageData = &global_language;
	TheGameLogic = &game_logic;
	TheAudio = &audio;
	TheDownloadManager = nullptr;
	TheMouse = &mouse;
	TheHeaderTemplateManager = &header_templates;
	TheTransitionHandler = &transition_handler;
	TheWindowManager = &window_manager;
	TheFunctionLexicon = &function_lexicon;

	global_data.m_initialFile.clear();
	global_data.m_shellMapOn = FALSE;
	global_data.m_animateWindows = FALSE;
	display.setWidth(800);
	display.setHeight(600);
	display.setBitDepth(32);
	display.setWindowed(TRUE);
	name_key_generator.init();
	function_lexicon.init();

	ok = expect(archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask),
		"Win32BIGFileSystem did not load WindowZH.big for original Shell::showShell") && ok;
	ok = expect(archive_file_system.loadBigFilesFromDirectory(archive_directory, AsciiString("INIZH.big")),
		"Win32BIGFileSystem did not load INIZH.big for original CreditsMenu path") && ok;
	ok = expect(file_system.doesFileExist("Window\\Menus\\MainMenu.wnd"),
		"WindowZH.big did not expose MainMenu.wnd through FileSystem") && ok;
	ok = expect(file_system.doesFileExist("Window\\Menus\\CreditsMenu.wnd"),
		"WindowZH.big did not expose CreditsMenu.wnd through FileSystem") && ok;
	ok = expect(file_system.doesFileExist("Data\\INI\\Credits.ini"),
		"INIZH.big did not expose Credits.ini through FileSystem") && ok;
	ok = expect(TheFunctionLexicon->winLayoutInitFunc(
			TheNameKeyGenerator->nameToKey(AsciiString("W3DMainMenuInit"))) == W3DMainMenuInit,
		"FunctionLexicon did not resolve W3DMainMenuInit for MainMenu.wnd") && ok;
	ok = expect(TheFunctionLexicon->gameWinSystemFunc(
			TheNameKeyGenerator->nameToKey(AsciiString("MainMenuSystem"))) == MainMenuSystem,
		"FunctionLexicon did not resolve MainMenuSystem for MainMenu.wnd") && ok;
	ok = expect(TheFunctionLexicon->winLayoutUpdateFunc(
			TheNameKeyGenerator->nameToKey(AsciiString("MainMenuUpdate"))) == MainMenuUpdate,
		"FunctionLexicon did not resolve MainMenuUpdate for MainMenu.wnd") && ok;
	ok = expect(TheFunctionLexicon->winLayoutInitFunc(
			TheNameKeyGenerator->nameToKey(AsciiString("CreditsMenuInit"))) == CreditsMenuInit,
		"FunctionLexicon did not resolve CreditsMenuInit to the original callback owner") && ok;
	ok = expect(TheFunctionLexicon->winLayoutUpdateFunc(
			TheNameKeyGenerator->nameToKey(AsciiString("CreditsMenuUpdate"))) == CreditsMenuUpdate,
		"FunctionLexicon did not resolve CreditsMenuUpdate to the original callback owner") && ok;
	ok = expect(TheFunctionLexicon->gameWinSystemFunc(
			TheNameKeyGenerator->nameToKey(AsciiString("CreditsMenuSystem"))) == CreditsMenuSystem,
		"FunctionLexicon did not resolve CreditsMenuSystem to the original callback owner") && ok;

	global_data.m_breakTheMovie = TRUE;
	g_mouse_visibility_true_calls = 0;
	g_mouse_visibility_false_calls = 0;
	g_raise_gs_message_box_calls = 0;
	g_http_think_wrapper_calls = 0;
	g_game_spy_update_overlays_calls = 0;
	g_download_update_calls = 0;
	g_transition_set_group_calls = 0;
	g_transition_is_finished_calls = 0;
	g_transition_reverse_calls = 0;
	g_transition_remove_calls = 0;
	g_last_transition_group.clear();
	g_last_transition_reverse_group.clear();
	g_last_transition_remove_group.clear();
	{
		Shell shell;
		TheShell = &shell;
		shell.showShell();
		WindowLayout *top = shell.top();
		GameWindow *main_parent = TheWindowManager->winGetWindowFromId(
			nullptr, TheNameKeyGenerator->nameToKey(AsciiString("MainMenu.wnd:MainMenuParent")));
		ok = expect(shell.getScreenCount() == 1,
			"original Shell::showShell did not push exactly one layout") && ok;
		ok = expect(top != nullptr && top->getFilename() == AsciiString("Menus/MainMenu.wnd"),
			"original Shell::showShell did not push Menus/MainMenu.wnd") && ok;
		ok = expect(main_parent != nullptr,
			"MainMenu.wnd did not create MainMenuParent through the shell stack") && ok;
		if (main_parent != nullptr) {
			ok = expect(main_parent->winGetSystemFunc() == MainMenuSystem,
				"MainMenuParent did not resolve MainMenuSystem through the original GUI lexicon") && ok;
			ok = expect(TheWindowManager->winGetFocus() == main_parent,
				"original MainMenuInit did not set keyboard focus to MainMenuParent") && ok;
			Bool wants_focus = FALSE;
			const WindowMsgHandledType focus_result = main_parent->winGetSystemFunc()(
				main_parent, GWM_INPUT_FOCUS, TRUE, reinterpret_cast<WindowMsgData>(&wants_focus));
			ok = expect(focus_result == MSG_HANDLED && wants_focus == TRUE,
				"original MainMenuSystem did not handle the input-focus path") && ok;
		}
		ok = expect(global_data.m_breakTheMovie == FALSE,
			"original MainMenuInit did not clear GlobalData::m_breakTheMovie") && ok;
		ok = expect(g_mouse_visibility_true_calls == 1 && g_mouse_visibility_false_calls == 1,
			"original MainMenuInit did not exercise the first-run mouse visibility path") && ok;
		ok = expect(TheMouse->getVisibility() == FALSE,
			"original MainMenuInit first-run branch did not leave the mouse hidden for fade-in") && ok;
		ok = expect(g_transition_reverse_calls == 1,
			"original MainMenuInit did not reverse the first-run FadeWholeScreen transition") && ok;
		for (const char *name : {
				"MainMenu.wnd:MapBorder1",
				"MainMenu.wnd:MapBorder2",
				"MainMenu.wnd:MapBorder3",
				"MainMenu.wnd:MapBorder4"}) {
			GameWindow *dropdown = TheWindowManager->winGetWindowFromId(main_parent,
				TheNameKeyGenerator->nameToKey(AsciiString(name)));
			ok = expect(dropdown != nullptr,
				"MainMenu.wnd did not create an expected dropdown window") && ok;
			if (dropdown != nullptr) {
				ok = expect(BitTest(dropdown->winGetStatus(), WIN_STATUS_HIDDEN),
					"original MainMenuInit did not hide dropdown window") && ok;
			}
		}
		// MainMenuInit enters Shell::showShellMap if GameLogic is already in-game.
		// This smoke owns the first idle-frame boundary, so switch modes after init.
		game_logic.setGameMode(GAME_SHELL);
		ok = expect(game_logic.isInGame() && game_logic.isInShellGame(),
			"focused GameLogic boundary did not represent shell-mode state for MainMenuUpdate") && ok;
		if (top != nullptr) {
			top->runUpdate();
		}
		ok = expect(g_raise_gs_message_box_calls == 1,
			"original MainMenuUpdate first idle frame did not cross the message-box boundary once") && ok;
		ok = expect(g_http_think_wrapper_calls == 1,
			"original MainMenuUpdate first idle frame did not tick the HTTP boundary once") && ok;
		ok = expect(g_game_spy_update_overlays_calls == 1,
			"original MainMenuUpdate first idle frame did not tick the GameSpy overlay boundary once") && ok;
		ok = expect(g_download_update_calls == 0,
			"original MainMenuUpdate should not enter the download branch when TheDownloadManager is null") && ok;
		ok = expect(g_transition_set_group_calls == 0 && g_transition_is_finished_calls == 0,
			"original MainMenuUpdate first idle frame unexpectedly entered transition/game-start branches") && ok;
		GameWindow *single_player_button = TheWindowManager->winGetWindowFromId(main_parent,
			TheNameKeyGenerator->nameToKey(AsciiString("MainMenu.wnd:ButtonSinglePlayer")));
		GameWindow *single_dropdown = TheWindowManager->winGetWindowFromId(main_parent,
			TheNameKeyGenerator->nameToKey(AsciiString("MainMenu.wnd:MapBorder")));
		GameWindow *main_dropdown = TheWindowManager->winGetWindowFromId(main_parent,
			TheNameKeyGenerator->nameToKey(AsciiString("MainMenu.wnd:MapBorder2")));
		GameWindow *load_replay_dropdown = TheWindowManager->winGetWindowFromId(main_parent,
			TheNameKeyGenerator->nameToKey(AsciiString("MainMenu.wnd:MapBorder3")));
		ok = expect(single_player_button != nullptr,
			"MainMenu.wnd did not create ButtonSinglePlayer for input navigation") && ok;
		ok = expect(single_dropdown != nullptr,
			"MainMenu.wnd did not create the single-player dropdown window") && ok;
		ok = expect(main_dropdown != nullptr,
			"MainMenu.wnd did not create the main dropdown window") && ok;
		ok = expect(load_replay_dropdown != nullptr,
			"MainMenu.wnd did not create the load-replay dropdown window") && ok;
		if (single_player_button != nullptr
				&& single_dropdown != nullptr
				&& main_dropdown != nullptr
				&& load_replay_dropdown != nullptr) {
			const WindowMsgData packed_click = center_click_data(single_player_button);
			const Int transition_is_finished_before_click = g_transition_is_finished_calls;
			const Int transition_remove_before_click = g_transition_remove_calls;
			const Int transition_reverse_before_click = g_transition_reverse_calls;
			const Int transition_set_group_before_click = g_transition_set_group_calls;
			ok = expect(BitTest(single_dropdown->winGetStatus(), WIN_STATUS_HIDDEN),
				"single-player dropdown should start hidden after original MainMenuInit") && ok;
			ok = expect(TheWindowManager->winSendInputMsg(single_player_button, GWM_LEFT_DOWN, packed_click, 0) == MSG_HANDLED,
				"ButtonSinglePlayer did not handle original GWM_LEFT_DOWN input") && ok;
			ok = expect(BitTest(single_player_button->winGetInstanceData()->m_state, WIN_STATE_SELECTED),
				"ButtonSinglePlayer did not enter selected state after original GWM_LEFT_DOWN") && ok;
			ok = expect(TheWindowManager->winSendInputMsg(single_player_button, GWM_LEFT_UP, packed_click, 0) == MSG_HANDLED,
				"ButtonSinglePlayer did not handle original GWM_LEFT_UP input") && ok;
			ok = expect(BitTest(single_player_button->winGetInstanceData()->m_state, WIN_STATE_SELECTED) == FALSE,
				"ButtonSinglePlayer did not clear selected state after original GWM_LEFT_UP") && ok;
			ok = expect(BitTest(single_dropdown->winGetStatus(), WIN_STATUS_HIDDEN) == FALSE,
				"original MainMenuSystem did not unhide the single-player dropdown after ButtonSinglePlayer input") && ok;
			ok = expect(g_transition_is_finished_calls == transition_is_finished_before_click + 1,
				"original MainMenuSystem did not query the transition boundary for ButtonSinglePlayer") && ok;
			ok = expect(g_transition_remove_calls == transition_remove_before_click + 1
					&& g_last_transition_remove_group == AsciiString("MainMenuDefaultMenu"),
				"original MainMenuSystem did not remove MainMenuDefaultMenu for ButtonSinglePlayer") && ok;
			ok = expect(g_transition_reverse_calls == transition_reverse_before_click + 1
					&& g_last_transition_reverse_group == AsciiString("MainMenuDefaultMenuBack"),
				"original MainMenuSystem did not reverse MainMenuDefaultMenuBack for ButtonSinglePlayer") && ok;
			ok = expect(g_transition_set_group_calls == transition_set_group_before_click + 1
					&& g_last_transition_group == AsciiString("MainMenuSinglePlayerMenu"),
				"original MainMenuSystem did not set MainMenuSinglePlayerMenu for ButtonSinglePlayer") && ok;
			ok = expect(shell.getScreenCount() == 1 && shell.top() == top,
				"ButtonSinglePlayer input should stop at the dropdown transition boundary without pushing another shell layout") && ok;
			if (top != nullptr) {
				top->runUpdate();
			}
			GameWindow *single_back_button = TheWindowManager->winGetWindowFromId(main_parent,
				TheNameKeyGenerator->nameToKey(AsciiString("MainMenu.wnd:ButtonSingleBack")));
			ok = expect(single_back_button != nullptr,
				"MainMenu.wnd did not create ButtonSingleBack for dropdown return navigation") && ok;
			if (single_back_button != nullptr) {
				const WindowMsgData packed_back_click = center_click_data(single_back_button);
				const Int back_transition_is_finished_before_click = g_transition_is_finished_calls;
				const Int back_transition_remove_before_click = g_transition_remove_calls;
				const Int back_transition_reverse_before_click = g_transition_reverse_calls;
				const Int back_transition_set_group_before_click = g_transition_set_group_calls;
				ok = expect(BitTest(main_dropdown->winGetStatus(), WIN_STATUS_HIDDEN),
					"main dropdown should still be hidden before ButtonSingleBack input") && ok;
				ok = expect(TheWindowManager->winSendInputMsg(single_back_button, GWM_LEFT_DOWN, packed_back_click, 0) == MSG_HANDLED,
					"ButtonSingleBack did not handle original GWM_LEFT_DOWN input") && ok;
				ok = expect(TheWindowManager->winSendInputMsg(single_back_button, GWM_LEFT_UP, packed_back_click, 0) == MSG_HANDLED,
					"ButtonSingleBack did not handle original GWM_LEFT_UP input") && ok;
				ok = expect(BitTest(single_back_button->winGetInstanceData()->m_state, WIN_STATE_SELECTED) == FALSE,
					"ButtonSingleBack did not clear selected state after original GWM_LEFT_UP") && ok;
				ok = expect(BitTest(main_dropdown->winGetStatus(), WIN_STATUS_HIDDEN) == FALSE,
					"original MainMenuSystem did not unhide the main dropdown after ButtonSingleBack input") && ok;
				ok = expect(g_transition_is_finished_calls == back_transition_is_finished_before_click + 1,
					"original MainMenuSystem did not query the transition boundary for ButtonSingleBack") && ok;
				ok = expect(g_transition_remove_calls == back_transition_remove_before_click + 1
						&& g_last_transition_remove_group == AsciiString("MainMenuSinglePlayerMenu"),
					"original MainMenuSystem did not remove MainMenuSinglePlayerMenu for ButtonSingleBack") && ok;
				ok = expect(g_transition_reverse_calls == back_transition_reverse_before_click + 1
						&& g_last_transition_reverse_group == AsciiString("MainMenuSinglePlayerMenuBack"),
					"original MainMenuSystem did not reverse MainMenuSinglePlayerMenuBack for ButtonSingleBack") && ok;
				ok = expect(g_transition_set_group_calls == back_transition_set_group_before_click + 1
						&& g_last_transition_group == AsciiString("MainMenuDefaultMenu"),
					"original MainMenuSystem did not set MainMenuDefaultMenu for ButtonSingleBack") && ok;
				ok = expect(shell.getScreenCount() == 1 && shell.top() == top,
					"ButtonSingleBack input should stay inside the MainMenu shell layout") && ok;
				}
				if (top != nullptr) {
					top->runUpdate();
				}
				GameWindow *load_replay_button = TheWindowManager->winGetWindowFromId(main_parent,
					TheNameKeyGenerator->nameToKey(AsciiString("MainMenu.wnd:ButtonLoadReplay")));
				ok = expect(load_replay_button != nullptr,
					"MainMenu.wnd did not create ButtonLoadReplay for dropdown navigation") && ok;
				if (load_replay_button != nullptr) {
					const WindowMsgData packed_load_replay_click = center_click_data(load_replay_button);
					const Int load_replay_transition_is_finished_before_click = g_transition_is_finished_calls;
					const Int load_replay_transition_remove_before_click = g_transition_remove_calls;
					const Int load_replay_transition_reverse_before_click = g_transition_reverse_calls;
					const Int load_replay_transition_set_group_before_click = g_transition_set_group_calls;
					ok = expect(BitTest(load_replay_dropdown->winGetStatus(), WIN_STATUS_HIDDEN),
						"load-replay dropdown should start hidden after original MainMenuInit") && ok;
					ok = expect(TheWindowManager->winSendInputMsg(load_replay_button, GWM_LEFT_DOWN, packed_load_replay_click, 0) == MSG_HANDLED,
						"ButtonLoadReplay did not handle original GWM_LEFT_DOWN input") && ok;
					ok = expect(TheWindowManager->winSendInputMsg(load_replay_button, GWM_LEFT_UP, packed_load_replay_click, 0) == MSG_HANDLED,
						"ButtonLoadReplay did not handle original GWM_LEFT_UP input") && ok;
					ok = expect(BitTest(load_replay_button->winGetInstanceData()->m_state, WIN_STATE_SELECTED) == FALSE,
						"ButtonLoadReplay did not clear selected state after original GWM_LEFT_UP") && ok;
					ok = expect(BitTest(load_replay_dropdown->winGetStatus(), WIN_STATUS_HIDDEN) == FALSE,
						"original MainMenuSystem did not unhide the load-replay dropdown after ButtonLoadReplay input") && ok;
					ok = expect(g_transition_is_finished_calls == load_replay_transition_is_finished_before_click + 1,
						"original MainMenuSystem did not query the transition boundary for ButtonLoadReplay") && ok;
					ok = expect(g_transition_remove_calls == load_replay_transition_remove_before_click + 1
							&& g_last_transition_remove_group == AsciiString("MainMenuDefaultMenu"),
						"original MainMenuSystem did not remove MainMenuDefaultMenu for ButtonLoadReplay") && ok;
					ok = expect(g_transition_reverse_calls == load_replay_transition_reverse_before_click + 1
							&& g_last_transition_reverse_group == AsciiString("MainMenuDefaultMenuBack"),
						"original MainMenuSystem did not reverse MainMenuDefaultMenuBack for ButtonLoadReplay") && ok;
					ok = expect(g_transition_set_group_calls == load_replay_transition_set_group_before_click + 1
							&& g_last_transition_group == AsciiString("MainMenuLoadReplayMenu"),
						"original MainMenuSystem did not set MainMenuLoadReplayMenu for ButtonLoadReplay") && ok;
					ok = expect(shell.getScreenCount() == 1 && shell.top() == top,
						"ButtonLoadReplay input should stay inside the MainMenu shell layout") && ok;
					if (top != nullptr) {
						top->runUpdate();
					}
					GameWindow *load_replay_back_button = TheWindowManager->winGetWindowFromId(main_parent,
						TheNameKeyGenerator->nameToKey(AsciiString("MainMenu.wnd:ButtonLoadReplayBack")));
					ok = expect(load_replay_back_button != nullptr,
						"MainMenu.wnd did not create ButtonLoadReplayBack for dropdown return navigation") && ok;
					if (load_replay_back_button != nullptr) {
						const WindowMsgData packed_load_replay_back_click = center_click_data(load_replay_back_button);
						const Int load_replay_back_transition_is_finished_before_click = g_transition_is_finished_calls;
						const Int load_replay_back_transition_remove_before_click = g_transition_remove_calls;
						const Int load_replay_back_transition_reverse_before_click = g_transition_reverse_calls;
						const Int load_replay_back_transition_set_group_before_click = g_transition_set_group_calls;
						ok = expect(TheWindowManager->winSendInputMsg(load_replay_back_button, GWM_LEFT_DOWN, packed_load_replay_back_click, 0) == MSG_HANDLED,
							"ButtonLoadReplayBack did not handle original GWM_LEFT_DOWN input") && ok;
						ok = expect(TheWindowManager->winSendInputMsg(load_replay_back_button, GWM_LEFT_UP, packed_load_replay_back_click, 0) == MSG_HANDLED,
							"ButtonLoadReplayBack did not handle original GWM_LEFT_UP input") && ok;
						ok = expect(BitTest(load_replay_back_button->winGetInstanceData()->m_state, WIN_STATE_SELECTED) == FALSE,
							"ButtonLoadReplayBack did not clear selected state after original GWM_LEFT_UP") && ok;
						ok = expect(BitTest(main_dropdown->winGetStatus(), WIN_STATUS_HIDDEN) == FALSE,
							"original MainMenuSystem did not unhide the main dropdown after ButtonLoadReplayBack input") && ok;
						ok = expect(g_transition_is_finished_calls == load_replay_back_transition_is_finished_before_click + 1,
							"original MainMenuSystem did not query the transition boundary for ButtonLoadReplayBack") && ok;
						ok = expect(g_transition_remove_calls == load_replay_back_transition_remove_before_click + 1
								&& g_last_transition_remove_group == AsciiString("MainMenuLoadReplayMenu"),
							"original MainMenuSystem did not remove MainMenuLoadReplayMenu for ButtonLoadReplayBack") && ok;
						ok = expect(g_transition_reverse_calls == load_replay_back_transition_reverse_before_click + 1
								&& g_last_transition_reverse_group == AsciiString("MainMenuLoadReplayMenuBack"),
							"original MainMenuSystem did not reverse MainMenuLoadReplayMenuBack for ButtonLoadReplayBack") && ok;
						ok = expect(g_transition_set_group_calls == load_replay_back_transition_set_group_before_click + 1
								&& g_last_transition_group == AsciiString("MainMenuDefaultMenu"),
							"original MainMenuSystem did not set MainMenuDefaultMenu for ButtonLoadReplayBack") && ok;
						ok = expect(shell.getScreenCount() == 1 && shell.top() == top,
							"ButtonLoadReplayBack input should stay inside the MainMenu shell layout") && ok;
					}
				}
				if (top != nullptr) {
					top->runUpdate();
				}
				game_logic.setGameMode(GAME_NONE);
				ok = expect(!game_logic.isInGame(),
					"focused GameLogic boundary did not leave shell-game mode before CreditsMenu showShellMap(FALSE)") && ok;
				GameWindow *credits_button = TheWindowManager->winGetWindowFromId(main_parent,
					TheNameKeyGenerator->nameToKey(AsciiString("MainMenu.wnd:ButtonCredits")));
				ok = expect(credits_button != nullptr,
					"MainMenu.wnd did not create ButtonCredits for submenu navigation") && ok;
				if (credits_button != nullptr) {
					const WindowMsgData packed_credits_click = center_click_data(credits_button);
					const Int credits_transition_is_finished_before_click = g_transition_is_finished_calls;
					const Int credits_transition_reverse_before_click = g_transition_reverse_calls;
					const Int credits_audio_add_before_click = audio.add_audio_event_calls;
					const Int credits_audio_remove_before_click = audio.remove_audio_event_calls;
					ok = expect(TheWindowManager->winSendInputMsg(credits_button, GWM_LEFT_DOWN, packed_credits_click, 0) == MSG_HANDLED,
						"ButtonCredits did not handle original GWM_LEFT_DOWN input") && ok;
					ok = expect(TheWindowManager->winSendInputMsg(credits_button, GWM_LEFT_UP, packed_credits_click, 0) == MSG_HANDLED,
						"ButtonCredits did not handle original GWM_LEFT_UP input") && ok;
					ok = expect(g_transition_is_finished_calls == credits_transition_is_finished_before_click + 1,
						"original MainMenuSystem did not query the transition boundary for ButtonCredits") && ok;
					ok = expect(g_transition_reverse_calls == credits_transition_reverse_before_click + 1
							&& g_last_transition_reverse_group == AsciiString("MainMenuDefaultMenu"),
						"original MainMenuSystem did not reverse MainMenuDefaultMenu for ButtonCredits") && ok;
					ok = expect(shell.getScreenCount() == 1 && shell.top() == top,
						"ButtonCredits input should leave a pending Shell::push until MainMenuUpdate completes shutdown") && ok;
					if (top != nullptr) {
						top->runUpdate();
					}
					WindowLayout *credits_layout = shell.top();
					GameWindow *credits_parent = TheWindowManager->winGetWindowFromId(nullptr,
						TheNameKeyGenerator->nameToKey(AsciiString("CreditsMenu.wnd:ParentCreditsWindow")));
					ok = expect(shell.getScreenCount() == 2,
						"original Shell::push did not stack CreditsMenu.wnd above MainMenu.wnd") && ok;
					ok = expect(credits_layout != nullptr
							&& credits_layout != top
							&& credits_layout->getFilename() == AsciiString("Menus/CreditsMenu.wnd"),
						"original ButtonCredits path did not push Menus/CreditsMenu.wnd") && ok;
					ok = expect(credits_parent != nullptr,
						"CreditsMenu.wnd did not create ParentCreditsWindow through the original shell stack") && ok;
					if (credits_parent != nullptr) {
						ok = expect(credits_parent->winGetSystemFunc() == CreditsMenuSystem,
							"CreditsMenu parent did not resolve CreditsMenuSystem through the original GUI lexicon") && ok;
						ok = expect(TheWindowManager->winGetFocus() == credits_parent,
							"original CreditsMenuInit did not set keyboard focus to ParentCreditsWindow") && ok;
					}
					ok = expect(TheCredits != nullptr,
						"original CreditsMenuInit did not create the CreditsManager") && ok;
					ok = expect(audio.remove_audio_event_calls == credits_audio_remove_before_click + 1
							&& audio.last_removed_audio_event == AHSV_StopTheMusicFade,
						"original CreditsMenuInit did not remove the existing music fade audio event") && ok;
					ok = expect(audio.add_audio_event_calls > credits_audio_add_before_click
							&& audio.last_audio_event_name == AsciiString("Credits"),
						"original CreditsMenuInit did not request the Credits music audio event") && ok;
					if (credits_layout != nullptr) {
						credits_layout->runUpdate();
						ok = expect(shell.top() == credits_layout
								|| (shell.getScreenCount() == 1 && shell.top() == top),
							"original CreditsMenuUpdate did not either keep CreditsMenu active or return to MainMenu through Shell::pop") && ok;
					}
				}
			}
			while (shell.getScreenCount() > 0) {
				shell.popImmediate();
			}
			ok = expect(shell.getScreenCount() == 0,
				"original Shell::popImmediate shutdowns did not clear the shell stack") && ok;
			ok = expect(TheCredits == nullptr,
				"original CreditsMenuShutdown did not release the CreditsManager") && ok;
		}
	TheShell = old_shell;
	window_manager.update();
	ok = expect(window_manager.winGetWindowList() == nullptr,
		"popping MainMenu.wnd through Shell should clear the original window list") && ok;

	TheFunctionLexicon = old_function_lexicon;
	TheWindowManager = old_window_manager;
	TheTransitionHandler = old_transition_handler;
	TheHeaderTemplateManager = old_header_templates;
	TheMouse = old_mouse;
	TheDownloadManager = old_download_manager;
	TheAudio = old_audio;
	TheGameLogic = old_game_logic;
	TheGlobalLanguageData = old_global_language;
	TheGameText = old_game_text;
	TheDisplayStringManager = old_display_string_manager;
	TheFontLibrary = old_font_library;
	TheDisplay = old_display;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;
	TheNameKeyGenerator = old_name_keys;
	TheSubsystemList = old_subsystem_list;
	TheGlobalData = old_global_data;

	return ok;
}

} // namespace

// W3DFunctionLexicon::init() loads the base GUI lexicon tables before adding
// W3D device entries. These test-local bodies satisfy unexecuted base callback
// owners without linking the full shell/control-bar/network graph.
AudioManager::AudioManager()
{
}

AudioManager::~AudioManager()
{
}

void AudioManager::init()
{
}

void AudioManager::postProcessLoad()
{
}

void AudioManager::reset()
{
}

void AudioManager::update()
{
}

void AudioManager::loseFocus()
{
}

void AudioManager::regainFocus()
{
}

AudioHandle AudioManager::addAudioEvent(const AudioEventRTS *)
{
	return AHSV_NoSound;
}

void AudioManager::removeAudioEvent(AudioHandle)
{
}

Bool AudioManager::isValidAudioEvent(const AudioEventRTS *) const
{
	return FALSE;
}

Bool AudioManager::isValidAudioEvent(AudioEventRTS *) const
{
	return FALSE;
}

void AudioManager::addTrackName(const AsciiString &)
{
}

AsciiString AudioManager::nextTrackName(const AsciiString &)
{
	return AsciiString::TheEmptyString;
}

AsciiString AudioManager::prevTrackName(const AsciiString &)
{
	return AsciiString::TheEmptyString;
}

void AudioManager::setAudioEventEnabled(AsciiString, Bool)
{
}

void AudioManager::setAudioEventVolumeOverride(AsciiString, Real)
{
}

void AudioManager::removeAudioEvent(AsciiString)
{
}

void AudioManager::removeDisabledEvents()
{
}

void AudioManager::getInfoForAudioEvent(const AudioEventRTS *) const
{
}

Bool AudioManager::isCurrentlyPlaying(AudioHandle)
{
	return FALSE;
}

UnsignedInt AudioManager::translateSpeakerTypeToUnsignedInt(const AsciiString &)
{
	return 0;
}

AsciiString AudioManager::translateUnsignedIntToSpeakerType(UnsignedInt)
{
	return AsciiString("unknown");
}

Bool AudioManager::isOn(AudioAffect) const
{
	return TRUE;
}

void AudioManager::setOn(Bool, AudioAffect)
{
}

void AudioManager::setVolume(Real, AudioAffect)
{
}

Real AudioManager::getVolume(AudioAffect)
{
	return 1.0f;
}

void AudioManager::set3DVolumeAdjustment(Real)
{
}

void AudioManager::setListenerPosition(const Coord3D *, const Coord3D *)
{
}

const Coord3D *AudioManager::getListenerPosition() const
{
	return nullptr;
}

AudioRequest *AudioManager::allocateAudioRequest(Bool)
{
	return nullptr;
}

void AudioManager::releaseAudioRequest(AudioRequest *)
{
}

void AudioManager::appendAudioRequest(AudioRequest *)
{
}

void AudioManager::processRequestList()
{
}

AudioEventInfo *AudioManager::newAudioEventInfo(AsciiString)
{
	return nullptr;
}

void AudioManager::addAudioEventInfo(AudioEventInfo *)
{
}

AudioEventInfo *AudioManager::findAudioEventInfo(AsciiString) const
{
	return nullptr;
}

const AudioSettings *AudioManager::getAudioSettings() const
{
	return nullptr;
}

const MiscAudio *AudioManager::getMiscAudio() const
{
	return nullptr;
}

void AudioManager::releaseAudioEventRTS(AudioEventRTS *)
{
}

AudioSettings *AudioManager::friend_getAudioSettings()
{
	return nullptr;
}

MiscAudio *AudioManager::friend_getMiscAudio()
{
	return nullptr;
}

const FieldParse *AudioManager::getFieldParseTable() const
{
	return nullptr;
}

void AudioManager::refreshCachedVariables()
{
}

Real AudioManager::getAudioLengthMS(const AudioEventRTS *)
{
	return 0.0f;
}

Bool AudioManager::isMusicAlreadyLoaded() const
{
	return TRUE;
}

void AudioManager::findAllAudioEventsOfType(AudioType, std::vector<AudioEventInfo *> &)
{
}

Bool AudioManager::isCurrentProviderHardwareAccelerated()
{
	return FALSE;
}

Bool AudioManager::isCurrentSpeakerTypeSurroundSound()
{
	return FALSE;
}

Bool AudioManager::shouldPlayLocally(const AudioEventRTS *)
{
	return FALSE;
}

AudioHandle AudioManager::allocateNewHandle()
{
	return 1;
}

void AudioManager::removeLevelSpecificAudioEventInfos()
{
}

void AudioManager::removeAllAudioRequests()
{
}

FontDesc::FontDesc() :
	name("Arial"),
	size(10),
	bold(FALSE)
{
}

GlobalLanguage::GlobalLanguage()
{
	m_unicodeFontName.clear();
	m_unicodeFontFileName.clear();
	m_useHardWrap = FALSE;
	m_militaryCaptionSpeed = 0;
	m_militaryCaptionDelayMS = 750;
	m_resolutionFontSizeAdjustment = 1.0f;
	m_creditsTitleFont.name = "Arial";
	m_creditsTitleFont.size = 14;
	m_creditsTitleFont.bold = TRUE;
	m_creditsPositionFont.name = "Arial";
	m_creditsPositionFont.size = 12;
	m_creditsPositionFont.bold = TRUE;
	m_creditsNormalFont.name = "Arial";
	m_creditsNormalFont.size = 10;
	m_creditsNormalFont.bold = FALSE;
}

GlobalLanguage::~GlobalLanguage()
{
}

void GlobalLanguage::init()
{
}

void GlobalLanguage::reset()
{
}

Int GlobalLanguage::adjustFontSize(Int fontSize)
{
	return fontSize;
}

void INI::parseLanguageDefinition(INI *)
{
}

const Image *ImageCollection::findImageByName(const AsciiString &)
{
	return nullptr;
}

WideChar Keyboard::getPrintableKey(UnsignedByte, Int)
{
	return 0;
}

void SelectionTranslator::setDragSelecting(Bool)
{
}

void SelectionTranslator::setLeftMouseButton(Bool)
{
}

#define DEFINE_LAYOUT_STUB(name) void name(WindowLayout *, void *) {}
#define DEFINE_WINDOW_STUB(name) \
	WindowMsgHandledType name(GameWindow *, UnsignedInt, WindowMsgData, WindowMsgData) { return MSG_IGNORED; }
#define DEFINE_DRAW_STUB(name) void name(GameWindow *, WinInstanceData *) {}

DEFINE_DRAW_STUB(IMECandidateMainDraw)
DEFINE_DRAW_STUB(IMECandidateTextAreaDraw)

DEFINE_LAYOUT_STUB(ChallengeMenuInit)
DEFINE_LAYOUT_STUB(ChallengeMenuShutdown)
DEFINE_LAYOUT_STUB(ChallengeMenuUpdate)
DEFINE_LAYOUT_STUB(DifficultySelectInit)
DEFINE_LAYOUT_STUB(DownloadMenuInit)
DEFINE_LAYOUT_STUB(DownloadMenuShutdown)
DEFINE_LAYOUT_STUB(DownloadMenuUpdate)
DEFINE_LAYOUT_STUB(GameInfoWindowInit)
DEFINE_LAYOUT_STUB(GameSpyPlayerInfoOverlayInit)
DEFINE_LAYOUT_STUB(GameSpyPlayerInfoOverlayShutdown)
DEFINE_LAYOUT_STUB(GameSpyPlayerInfoOverlayUpdate)
DEFINE_LAYOUT_STUB(InGamePopupMessageInit)
DEFINE_LAYOUT_STUB(KeyboardOptionsMenuInit)
DEFINE_LAYOUT_STUB(KeyboardOptionsMenuShutdown)
DEFINE_LAYOUT_STUB(LanGameOptionsMenuInit)
DEFINE_LAYOUT_STUB(LanGameOptionsMenuShutdown)
DEFINE_LAYOUT_STUB(LanGameOptionsMenuUpdate)
DEFINE_LAYOUT_STUB(LanLobbyMenuInit)
DEFINE_LAYOUT_STUB(LanLobbyMenuShutdown)
DEFINE_LAYOUT_STUB(LanLobbyMenuUpdate)
DEFINE_LAYOUT_STUB(LanMapSelectMenuInit)
DEFINE_LAYOUT_STUB(LanMapSelectMenuShutdown)
DEFINE_LAYOUT_STUB(LanMapSelectMenuUpdate)
DEFINE_LAYOUT_STUB(MapSelectMenuInit)
DEFINE_LAYOUT_STUB(MapSelectMenuShutdown)
DEFINE_LAYOUT_STUB(MapSelectMenuUpdate)
DEFINE_LAYOUT_STUB(NetworkDirectConnectInit)
DEFINE_LAYOUT_STUB(NetworkDirectConnectShutdown)
DEFINE_LAYOUT_STUB(NetworkDirectConnectUpdate)
DEFINE_LAYOUT_STUB(OptionsMenuInit)
DEFINE_LAYOUT_STUB(OptionsMenuShutdown)
DEFINE_LAYOUT_STUB(OptionsMenuUpdate)
DEFINE_LAYOUT_STUB(PopupCommunicatorInit)
DEFINE_LAYOUT_STUB(PopupCommunicatorShutdown)
DEFINE_LAYOUT_STUB(PopupHostGameInit)
DEFINE_LAYOUT_STUB(PopupHostGameUpdate)
DEFINE_LAYOUT_STUB(PopupJoinGameInit)
DEFINE_LAYOUT_STUB(PopupLadderSelectInit)
DEFINE_LAYOUT_STUB(PopupReplayInit)
DEFINE_LAYOUT_STUB(PopupReplayShutdown)
DEFINE_LAYOUT_STUB(PopupReplayUpdate)
DEFINE_LAYOUT_STUB(RCGameDetailsMenuInit)
DEFINE_LAYOUT_STUB(ReplayMenuInit)
DEFINE_LAYOUT_STUB(ReplayMenuShutdown)
DEFINE_LAYOUT_STUB(ReplayMenuUpdate)
DEFINE_LAYOUT_STUB(SaveLoadMenuFullScreenInit)
DEFINE_LAYOUT_STUB(SaveLoadMenuInit)
DEFINE_LAYOUT_STUB(SaveLoadMenuShutdown)
DEFINE_LAYOUT_STUB(SaveLoadMenuUpdate)
DEFINE_LAYOUT_STUB(ScoreScreenInit)
DEFINE_LAYOUT_STUB(ScoreScreenShutdown)
DEFINE_LAYOUT_STUB(ScoreScreenUpdate)
DEFINE_LAYOUT_STUB(SinglePlayerMenuInit)
DEFINE_LAYOUT_STUB(SinglePlayerMenuShutdown)
DEFINE_LAYOUT_STUB(SinglePlayerMenuUpdate)
DEFINE_LAYOUT_STUB(SkirmishGameOptionsMenuInit)
DEFINE_LAYOUT_STUB(SkirmishGameOptionsMenuShutdown)
DEFINE_LAYOUT_STUB(SkirmishGameOptionsMenuUpdate)
DEFINE_LAYOUT_STUB(SkirmishMapSelectMenuInit)
DEFINE_LAYOUT_STUB(SkirmishMapSelectMenuShutdown)
DEFINE_LAYOUT_STUB(SkirmishMapSelectMenuUpdate)
DEFINE_LAYOUT_STUB(WOLBuddyOverlayInit)
DEFINE_LAYOUT_STUB(WOLBuddyOverlayRCMenuInit)
DEFINE_LAYOUT_STUB(WOLBuddyOverlayShutdown)
DEFINE_LAYOUT_STUB(WOLBuddyOverlayUpdate)
DEFINE_LAYOUT_STUB(WOLCustomScoreScreenInit)
DEFINE_LAYOUT_STUB(WOLCustomScoreScreenShutdown)
DEFINE_LAYOUT_STUB(WOLCustomScoreScreenUpdate)
DEFINE_LAYOUT_STUB(WOLGameSetupMenuInit)
DEFINE_LAYOUT_STUB(WOLGameSetupMenuShutdown)
DEFINE_LAYOUT_STUB(WOLGameSetupMenuUpdate)
DEFINE_LAYOUT_STUB(WOLLadderScreenInit)
DEFINE_LAYOUT_STUB(WOLLadderScreenShutdown)
DEFINE_LAYOUT_STUB(WOLLadderScreenUpdate)
DEFINE_LAYOUT_STUB(WOLLobbyMenuInit)
DEFINE_LAYOUT_STUB(WOLLobbyMenuShutdown)
DEFINE_LAYOUT_STUB(WOLLobbyMenuUpdate)
DEFINE_LAYOUT_STUB(WOLLocaleSelectInit)
DEFINE_LAYOUT_STUB(WOLLocaleSelectShutdown)
DEFINE_LAYOUT_STUB(WOLLocaleSelectUpdate)
DEFINE_LAYOUT_STUB(WOLLoginMenuInit)
DEFINE_LAYOUT_STUB(WOLLoginMenuShutdown)
DEFINE_LAYOUT_STUB(WOLLoginMenuUpdate)
DEFINE_LAYOUT_STUB(WOLMapSelectMenuInit)
DEFINE_LAYOUT_STUB(WOLMapSelectMenuShutdown)
DEFINE_LAYOUT_STUB(WOLMapSelectMenuUpdate)
DEFINE_LAYOUT_STUB(WOLMessageWindowInit)
DEFINE_LAYOUT_STUB(WOLMessageWindowShutdown)
DEFINE_LAYOUT_STUB(WOLMessageWindowUpdate)
DEFINE_LAYOUT_STUB(WOLQMScoreScreenInit)
DEFINE_LAYOUT_STUB(WOLQMScoreScreenShutdown)
DEFINE_LAYOUT_STUB(WOLQMScoreScreenUpdate)
DEFINE_LAYOUT_STUB(WOLQuickMatchMenuInit)
DEFINE_LAYOUT_STUB(WOLQuickMatchMenuShutdown)
DEFINE_LAYOUT_STUB(WOLQuickMatchMenuUpdate)
DEFINE_LAYOUT_STUB(WOLStatusMenuInit)
DEFINE_LAYOUT_STUB(WOLStatusMenuShutdown)
DEFINE_LAYOUT_STUB(WOLStatusMenuUpdate)
DEFINE_LAYOUT_STUB(WOLWelcomeMenuInit)
DEFINE_LAYOUT_STUB(WOLWelcomeMenuShutdown)
DEFINE_LAYOUT_STUB(WOLWelcomeMenuUpdate)

DEFINE_WINDOW_STUB(BeaconWindowInput)
DEFINE_WINDOW_STUB(ChallengeMenuInput)
DEFINE_WINDOW_STUB(ChallengeMenuSystem)
DEFINE_WINDOW_STUB(ControlBarInput)
DEFINE_WINDOW_STUB(ControlBarObserverSystem)
DEFINE_WINDOW_STUB(ControlBarSystem)
DEFINE_WINDOW_STUB(DifficultySelectInput)
DEFINE_WINDOW_STUB(DifficultySelectSystem)
DEFINE_WINDOW_STUB(DiplomacyInput)
DEFINE_WINDOW_STUB(DiplomacySystem)
DEFINE_WINDOW_STUB(DisconnectControlInput)
DEFINE_WINDOW_STUB(DisconnectControlSystem)
DEFINE_WINDOW_STUB(DownloadMenuInput)
DEFINE_WINDOW_STUB(DownloadMenuSystem)
DEFINE_WINDOW_STUB(EstablishConnectionsControlInput)
DEFINE_WINDOW_STUB(EstablishConnectionsControlSystem)
DEFINE_WINDOW_STUB(ExtendedMessageBoxSystem)
DEFINE_WINDOW_STUB(GameInfoWindowSystem)
DEFINE_WINDOW_STUB(GameSpyPlayerInfoOverlayInput)
DEFINE_WINDOW_STUB(GameSpyPlayerInfoOverlaySystem)
DEFINE_WINDOW_STUB(GeneralsExpPointsInput)
DEFINE_WINDOW_STUB(GeneralsExpPointsSystem)
DEFINE_WINDOW_STUB(IMECandidateWindowInput)
DEFINE_WINDOW_STUB(IMECandidateWindowSystem)
DEFINE_WINDOW_STUB(IdleWorkerSystem)
DEFINE_WINDOW_STUB(InGameChatInput)
DEFINE_WINDOW_STUB(InGameChatSystem)
DEFINE_WINDOW_STUB(InGamePopupMessageInput)
DEFINE_WINDOW_STUB(InGamePopupMessageSystem)
DEFINE_WINDOW_STUB(KeyboardOptionsMenuInput)
DEFINE_WINDOW_STUB(KeyboardOptionsMenuSystem)
DEFINE_WINDOW_STUB(LanGameOptionsMenuInput)
DEFINE_WINDOW_STUB(LanGameOptionsMenuSystem)
DEFINE_WINDOW_STUB(LanLobbyMenuInput)
DEFINE_WINDOW_STUB(LanLobbyMenuSystem)
DEFINE_WINDOW_STUB(LanMapSelectMenuInput)
DEFINE_WINDOW_STUB(LanMapSelectMenuSystem)
DEFINE_WINDOW_STUB(LeftHUDInput)
DEFINE_WINDOW_STUB(MOTDSystem)
DEFINE_WINDOW_STUB(MapSelectMenuInput)
DEFINE_WINDOW_STUB(MapSelectMenuSystem)
DEFINE_WINDOW_STUB(NetworkDirectConnectInput)
DEFINE_WINDOW_STUB(NetworkDirectConnectSystem)
DEFINE_WINDOW_STUB(OptionsMenuInput)
DEFINE_WINDOW_STUB(OptionsMenuSystem)
DEFINE_WINDOW_STUB(PopupBuddyNotificationSystem)
DEFINE_WINDOW_STUB(PopupCommunicatorInput)
DEFINE_WINDOW_STUB(PopupCommunicatorSystem)
DEFINE_WINDOW_STUB(PopupHostGameInput)
DEFINE_WINDOW_STUB(PopupHostGameSystem)
DEFINE_WINDOW_STUB(PopupJoinGameInput)
DEFINE_WINDOW_STUB(PopupJoinGameSystem)
DEFINE_WINDOW_STUB(PopupLadderSelectInput)
DEFINE_WINDOW_STUB(PopupLadderSelectSystem)
DEFINE_WINDOW_STUB(PopupReplayInput)
DEFINE_WINDOW_STUB(PopupReplaySystem)
DEFINE_WINDOW_STUB(QuitMenuSystem)
DEFINE_WINDOW_STUB(RCGameDetailsMenuSystem)
DEFINE_WINDOW_STUB(ReplayControlInput)
DEFINE_WINDOW_STUB(ReplayControlSystem)
DEFINE_WINDOW_STUB(ReplayMenuInput)
DEFINE_WINDOW_STUB(ReplayMenuSystem)
DEFINE_WINDOW_STUB(SaveLoadMenuInput)
DEFINE_WINDOW_STUB(SaveLoadMenuSystem)
DEFINE_WINDOW_STUB(ScoreScreenInput)
DEFINE_WINDOW_STUB(ScoreScreenSystem)
DEFINE_WINDOW_STUB(SinglePlayerMenuInput)
DEFINE_WINDOW_STUB(SinglePlayerMenuSystem)
DEFINE_WINDOW_STUB(SkirmishGameOptionsMenuInput)
DEFINE_WINDOW_STUB(SkirmishGameOptionsMenuSystem)
DEFINE_WINDOW_STUB(SkirmishMapSelectMenuInput)
DEFINE_WINDOW_STUB(SkirmishMapSelectMenuSystem)
DEFINE_WINDOW_STUB(WOLBuddyOverlayInput)
DEFINE_WINDOW_STUB(WOLBuddyOverlayRCMenuSystem)
DEFINE_WINDOW_STUB(WOLBuddyOverlaySystem)
DEFINE_WINDOW_STUB(WOLCustomScoreScreenInput)
DEFINE_WINDOW_STUB(WOLCustomScoreScreenSystem)
DEFINE_WINDOW_STUB(WOLGameSetupMenuInput)
DEFINE_WINDOW_STUB(WOLGameSetupMenuSystem)
DEFINE_WINDOW_STUB(WOLLadderScreenInput)
DEFINE_WINDOW_STUB(WOLLadderScreenSystem)
DEFINE_WINDOW_STUB(WOLLobbyMenuInput)
DEFINE_WINDOW_STUB(WOLLobbyMenuSystem)
DEFINE_WINDOW_STUB(WOLLocaleSelectInput)
DEFINE_WINDOW_STUB(WOLLocaleSelectSystem)
DEFINE_WINDOW_STUB(WOLLoginMenuInput)
DEFINE_WINDOW_STUB(WOLLoginMenuSystem)
DEFINE_WINDOW_STUB(WOLMapSelectMenuInput)
DEFINE_WINDOW_STUB(WOLMapSelectMenuSystem)
DEFINE_WINDOW_STUB(WOLMessageWindowInput)
DEFINE_WINDOW_STUB(WOLMessageWindowSystem)
DEFINE_WINDOW_STUB(WOLQMScoreScreenInput)
DEFINE_WINDOW_STUB(WOLQMScoreScreenSystem)
DEFINE_WINDOW_STUB(WOLQuickMatchMenuInput)
DEFINE_WINDOW_STUB(WOLQuickMatchMenuSystem)
DEFINE_WINDOW_STUB(WOLStatusMenuInput)
DEFINE_WINDOW_STUB(WOLStatusMenuSystem)
DEFINE_WINDOW_STUB(WOLWelcomeMenuInput)
DEFINE_WINDOW_STUB(WOLWelcomeMenuSystem)

#undef DEFINE_DRAW_STUB
#undef DEFINE_LAYOUT_STUB
#undef DEFINE_WINDOW_STUB

void W3DGameWinDefaultDraw(GameWindow *, WinInstanceData *) {}
void W3DGadgetPushButtonDraw(GameWindow *, WinInstanceData *) {}
void W3DGadgetPushButtonImageDraw(GameWindow *, WinInstanceData *) {}
void W3DGadgetCheckBoxDraw(GameWindow *, WinInstanceData *) {}
void W3DGadgetCheckBoxImageDraw(GameWindow *, WinInstanceData *) {}
void W3DGadgetRadioButtonDraw(GameWindow *, WinInstanceData *) {}
void W3DGadgetRadioButtonImageDraw(GameWindow *, WinInstanceData *) {}
void W3DGadgetTabControlDraw(GameWindow *, WinInstanceData *) {}
void W3DGadgetTabControlImageDraw(GameWindow *, WinInstanceData *) {}
void W3DGadgetListBoxDraw(GameWindow *, WinInstanceData *) {}
void W3DGadgetListBoxImageDraw(GameWindow *, WinInstanceData *) {}
void W3DGadgetComboBoxDraw(GameWindow *, WinInstanceData *) {}
void W3DGadgetComboBoxImageDraw(GameWindow *, WinInstanceData *) {}
void W3DGadgetHorizontalSliderDraw(GameWindow *, WinInstanceData *) {}
void W3DGadgetHorizontalSliderImageDraw(GameWindow *, WinInstanceData *) {}
void W3DGadgetVerticalSliderDraw(GameWindow *, WinInstanceData *) {}
void W3DGadgetVerticalSliderImageDraw(GameWindow *, WinInstanceData *) {}
void W3DGadgetProgressBarDraw(GameWindow *, WinInstanceData *) {}
void W3DGadgetProgressBarImageDraw(GameWindow *, WinInstanceData *) {}
void W3DGadgetStaticTextDraw(GameWindow *, WinInstanceData *) {}
void W3DGadgetStaticTextImageDraw(GameWindow *, WinInstanceData *) {}
void W3DGadgetTextEntryDraw(GameWindow *, WinInstanceData *) {}
void W3DGadgetTextEntryImageDraw(GameWindow *, WinInstanceData *) {}
void W3DLeftHUDDraw(GameWindow *, WinInstanceData *) {}
void W3DCameoMovieDraw(GameWindow *, WinInstanceData *) {}
void W3DRightHUDDraw(GameWindow *, WinInstanceData *) {}
void W3DPowerDraw(GameWindow *, WinInstanceData *) {}
void W3DCommandBarGridDraw(GameWindow *, WinInstanceData *) {}
void W3DCommandBarGenExpDraw(GameWindow *, WinInstanceData *) {}
void W3DCommandBarHelpPopupDraw(GameWindow *, WinInstanceData *) {}
void W3DCommandBarBackgroundDraw(GameWindow *, WinInstanceData *) {}
void W3DCommandBarForegroundDraw(GameWindow *, WinInstanceData *) {}
void W3DCommandBarTopDraw(GameWindow *, WinInstanceData *) {}
void W3DNoDraw(GameWindow *, WinInstanceData *) {}
void W3DDrawMapPreview(GameWindow *, WinInstanceData *) {}

void GameSpyCloseAllOverlays()
{
}

void GameSpyUpdateOverlays()
{
	++g_game_spy_update_overlays_calls;
}

void RaiseGSMessageBox()
{
	++g_raise_gs_message_box_calls;
}

void TearDownGameSpy()
{
}

void StartPatchCheck()
{
}

void CancelPatchCheckCallback()
{
}

void HTTPThinkWrapper()
{
	++g_http_think_wrapper_calls;
}

void StopAsyncDNSCheck()
{
}

void StartDownloadingPatches()
{
}

Bool IsFirstCDPresent()
{
	return TRUE;
}

const FieldParse GameWindowTransitionsHandler::m_gameWindowTransitionsFieldParseTable[] = {
	{NULL, NULL, NULL, 0}
};

GameWindowTransitionsHandler::GameWindowTransitionsHandler()
{
}

GameWindowTransitionsHandler::~GameWindowTransitionsHandler()
{
}

void GameWindowTransitionsHandler::init()
{
}

void GameWindowTransitionsHandler::load()
{
}

void GameWindowTransitionsHandler::reset()
{
}

void GameWindowTransitionsHandler::update()
{
}

void GameWindowTransitionsHandler::draw()
{
}

Bool GameWindowTransitionsHandler::isFinished()
{
	++g_transition_is_finished_calls;
	return TRUE;
}

void GameWindowTransitionsHandler::parseWindow(INI *, void *, void *, const void *)
{
}

void GameWindowTransitionsHandler::setGroup(AsciiString groupName, Bool)
{
	++g_transition_set_group_calls;
	g_last_transition_group = groupName;
}

void GameWindowTransitionsHandler::reverse(AsciiString groupName)
{
	++g_transition_reverse_calls;
	g_last_transition_reverse_group = groupName;
}

void GameWindowTransitionsHandler::remove(AsciiString groupName, Bool)
{
	++g_transition_remove_calls;
	g_last_transition_remove_group = groupName;
}

TransitionGroup *GameWindowTransitionsHandler::getNewGroup(AsciiString)
{
	return nullptr;
}

GameWindow *ExMessageBoxOkCancel(UnicodeString, UnicodeString, void *, MessageBoxFunc, MessageBoxFunc)
{
	return nullptr;
}

void ScriptEngine::setGlobalDifficulty(GameDifficulty)
{
}

void CampaignManager::setCampaign(AsciiString)
{
}

AsciiString CampaignManager::getCurrentMap()
{
	return AsciiString::TheEmptyString;
}

HRESULT DownloadManager::update()
{
	++g_download_update_calls;
	return S_OK;
}

UserPreferences::UserPreferences()
{
}

UserPreferences::~UserPreferences()
{
}

Bool UserPreferences::load(AsciiString)
{
	return TRUE;
}

Bool UserPreferences::write()
{
	return TRUE;
}

OptionPreferences::OptionPreferences()
{
}

OptionPreferences::~OptionPreferences()
{
}

void OptionPreferences::setCampaignDifficulty(Int)
{
}

void MapCache::updateCache()
{
}

int main()
{
	const char *archive_path = "artifacts/real-assets/WindowZH.big";

	initMemoryManager();
	const bool ok = exercise_w3d_layout_script()
		&& exercise_w3d_archive_layout_script(archive_path)
		&& exercise_w3d_shell_main_menu_push(archive_path);
	shutdownMemoryManager();

	if (!ok) {
		return 1;
	}

	std::cout
		<< "{\"ok\":true,"
		<< "\"library\":\"W3DFunctionLexicon\","
		<< "\"path\":\"WindowLayout::load->GameWindowManager::winCreateFromScript\","
		<< "\"layout\":\"Menus/BlankWindow.wnd\","
		<< "\"archive\":\"" << archive_path << "\","
		<< "\"archiveLayouts\":[\"Menus/MessageBox.wnd\",\"Menus/QuitMessageBox.wnd\",\"Menus/MainMenu.wnd\",\"Menus/CreditsMenu.wnd\"],"
		<< "\"assetArchives\":[\"WindowZH.big\",\"INIZH.big\"],"
		<< "\"shellLayouts\":[\"Menus/MainMenu.wnd\",\"Menus/CreditsMenu.wnd\"],"
		<< "\"callbackOwners\":[\"MessageBoxSystem\",\"QuitMessageBoxSystem\",\"CreditsMenuSystem\",\"PassMessagesToParentSystem\"],"
		<< "\"shellCallbackNames\":[\"W3DMainMenuInit\",\"MainMenuUpdate\",\"MainMenuSystem\",\"MainMenuShutdown\",\"CreditsMenuInit\",\"CreditsMenuUpdate\",\"CreditsMenuSystem\"],"
		<< "\"callbackPaths\":[\"W3DMainMenuInit->original MainMenuInit\",\"MainMenuSystem(GWM_INPUT_FOCUS)\",\"MainMenuUpdate(first idle frame)\",\"GadgetPushButton ButtonSinglePlayer click->MainMenuSystem dropdown transition\",\"GadgetPushButton ButtonSingleBack click->MainMenuSystem dropdown return\",\"GadgetPushButton ButtonLoadReplay click->MainMenuSystem dropdown transition\",\"GadgetPushButton ButtonLoadReplayBack click->MainMenuSystem dropdown return\",\"GadgetPushButton ButtonCredits click->MainMenuSystem pending Shell::push CreditsMenu\",\"MainMenuUpdate shutdownComplete->original CreditsMenuInit\",\"CreditsMenuUpdate real callback\"],"
		<< "\"covered\":\"original WindowLayout load, Win32BIGFileSystem WindowZH.big and INIZH.big mount, .wnd parser, W3DFunctionLexicon device layout-init/update lookup, original W3DMainMenuInit to original MainMenuInit first-run state mutation, original MainMenuSystem input-focus handling, original MainMenuUpdate first idle frame under shell GameLogic state, original GadgetPushButton ButtonSinglePlayer click through GameWindowManager::winSendInputMsg to MainMenuSystem dropdown transition, original ButtonSingleBack click returning to the main dropdown through the same input path, original ButtonLoadReplay click opening the load-replay dropdown through MainMenuSystem, original ButtonLoadReplayBack click returning to the main dropdown through MainMenuSystem, original ButtonCredits click through MainMenuSystem into Shell::push CreditsMenu.wnd, original MainMenuUpdate shutdownComplete running original CreditsMenuInit, original CreditsMenuUpdate callback execution, real CreditsManager load from INIZH.big Data\\\\INI\\\\Credits.ini, original CreditsMenu audio-event boundary through local AudioManager device owner, original Shell::showShell/Shell::push MainMenu.wnd and CreditsMenu.wnd stack ownership, MainMenu.wnd and CreditsMenu.wnd callback-name binding, original message-box callback ownership, NameKey window id, and parsed GameWindow ownership\"}"
		<< "\n";
	return 0;
}
