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

#include "Common/File.h"
#include "Common/FileSystem.h"
#include "Common/FunctionLexicon.h"
#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/LocalFileSystem.h"
#include "Common/NameKeyGenerator.h"
#include "Common/SubsystemInterface.h"
#include "Common/ArchiveFileSystem.h"
#include "GameClient/Display.h"
#include "GameClient/DisplayStringManager.h"
#include "GameClient/GameFont.h"
#include "GameClient/GameText.h"
#include "GameClient/GameWindow.h"
#include "GameClient/GameWindowManager.h"
#include "GameClient/GlobalLanguage.h"
#include "GameClient/HeaderTemplate.h"
#include "GameClient/Image.h"
#include "GameClient/Keyboard.h"
#include "GameClient/SelectionXlat.h"
#include "GameClient/Shell.h"
#include "GameClient/WinInstanceData.h"
#include "GameClient/WindowLayout.h"
#include "W3DDevice/Common/W3DFunctionLexicon.h"
#include "Win32Device/Common/Win32BIGFileSystem.h"
#include "Win32Device/Common/Win32LocalFileSystem.h"

class GameLogic;
class Credits;
class DisplayStringManager;
class GameTextInterface;
class GlobalLanguage;
class IMEManagerInterface;
class ImageCollection;
class InGameUI;
class Keyboard;
class SelectionTranslator;
class VideoPlayerInterface;
class View;
class GameSpyInfoInterface;
void W3DMainMenuInit(WindowLayout *layout, void *userData);
void MainMenuInit(WindowLayout *layout, void *userData);
void MainMenuShutdown(WindowLayout *layout, void *userData);
WindowMsgHandledType MainMenuSystem(GameWindow *window, UnsignedInt msg,
	WindowMsgData mData1, WindowMsgData mData2);
WindowMsgHandledType MessageBoxSystem(GameWindow *window, UnsignedInt msg,
	WindowMsgData mData1, WindowMsgData mData2);
WindowMsgHandledType QuitMessageBoxSystem(GameWindow *window, UnsignedInt msg,
	WindowMsgData mData1, WindowMsgData mData2);

GlobalData *TheGlobalData = nullptr;
SubsystemInterfaceList *TheSubsystemList = nullptr;
GameLogic *TheGameLogic = nullptr;
GameTextInterface *TheGameText = nullptr;
GlobalLanguage *TheGlobalLanguageData = nullptr;
IMEManagerInterface *TheIMEManager = nullptr;
ImageCollection *TheMappedImageCollection = nullptr;
InGameUI *TheInGameUI = nullptr;
Keyboard *TheKeyboard = nullptr;
SelectionTranslator *TheSelectionTranslator = nullptr;
VideoPlayerInterface *TheVideoPlayer = nullptr;
View *TheTacticalView = nullptr;
GameSpyInfoInterface *TheGameSpyInfo = nullptr;
Credits *TheCredits = nullptr;
HWND ApplicationHWnd = NULL;
const Char *g_strFile = "Data\\Generals.str";
const Char *g_csfFile = "Data\\%s\\Generals.csf";

namespace {

Int g_main_menu_init_calls = 0;
Int g_main_menu_shutdown_calls = 0;

std::string normalized_path(const Char *path)
{
	std::string result = path != nullptr ? path : "";
	std::replace(result.begin(), result.end(), '/', '\\');
	std::transform(result.begin(), result.end(), result.begin(),
		[](unsigned char ch) { return static_cast<char>(std::tolower(ch)); });
	return result;
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

	g_main_menu_init_calls = 0;
	if (layout != nullptr) {
		layout->runInit();
	}
	ok = expect(g_main_menu_init_calls == 1,
		"original W3DMainMenuInit did not reach the MainMenuInit boundary through W3DFunctionLexicon lookup") && ok;
	if (layout != nullptr) {
		layout->runUpdate();
		layout->runShutdown();
		ok = expect(g_main_menu_init_calls == 1,
			"[None] update/shutdown callbacks should not call W3DMainMenuInit again") && ok;
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
	TheHeaderTemplateManager = &header_templates;
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
	ok = expect(file_system.doesFileExist("Window\\Menus\\MainMenu.wnd"),
		"WindowZH.big did not expose MainMenu.wnd through FileSystem") && ok;
	ok = expect(TheFunctionLexicon->winLayoutInitFunc(
			TheNameKeyGenerator->nameToKey(AsciiString("W3DMainMenuInit"))) == W3DMainMenuInit,
		"FunctionLexicon did not resolve W3DMainMenuInit for MainMenu.wnd") && ok;
	ok = expect(TheFunctionLexicon->gameWinSystemFunc(
			TheNameKeyGenerator->nameToKey(AsciiString("MainMenuSystem"))) == MainMenuSystem,
		"FunctionLexicon did not resolve MainMenuSystem for MainMenu.wnd") && ok;

	g_main_menu_init_calls = 0;
	g_main_menu_shutdown_calls = 0;
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
		ok = expect(g_main_menu_init_calls == 1,
			"original Shell::doPush did not execute W3DMainMenuInit through to the MainMenuInit boundary") && ok;
		ok = expect(main_parent != nullptr,
			"MainMenu.wnd did not create MainMenuParent through the shell stack") && ok;
		if (main_parent != nullptr) {
			ok = expect(main_parent->winGetSystemFunc() == MainMenuSystem,
				"MainMenuParent did not resolve MainMenuSystem through the original GUI lexicon") && ok;
		}
		shell.popImmediate();
		ok = expect(g_main_menu_shutdown_calls == 1,
			"original Shell::popImmediate did not execute the MainMenu layout shutdown callback") && ok;
		ok = expect(shell.getScreenCount() == 0,
			"original Shell::popImmediate did not clear the shell stack") && ok;
	}
	TheShell = old_shell;
	window_manager.update();
	ok = expect(window_manager.winGetWindowList() == nullptr,
		"popping MainMenu.wnd through Shell should clear the original window list") && ok;

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

} // namespace

// W3DFunctionLexicon::init() loads the base GUI lexicon tables before adding
// W3D device entries. These test-local bodies satisfy unexecuted base callback
// owners without linking the full shell/control-bar/network graph.
Int GlobalLanguage::adjustFontSize(Int fontSize)
{
	return fontSize;
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
DEFINE_LAYOUT_STUB(CreditsMenuInit)
DEFINE_LAYOUT_STUB(CreditsMenuShutdown)
DEFINE_LAYOUT_STUB(CreditsMenuUpdate)
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
DEFINE_LAYOUT_STUB(MainMenuUpdate)
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
DEFINE_WINDOW_STUB(CreditsMenuInput)
DEFINE_WINDOW_STUB(CreditsMenuSystem)
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
DEFINE_WINDOW_STUB(MainMenuInput)
DEFINE_WINDOW_STUB(MainMenuSystem)
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

void MainMenuInit(WindowLayout *, void *)
{
	++g_main_menu_init_calls;
}

void MainMenuShutdown(WindowLayout *, void *)
{
	++g_main_menu_shutdown_calls;
}

void GameSpyCloseAllOverlays()
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
		<< "\"archiveLayouts\":[\"Menus/MessageBox.wnd\",\"Menus/QuitMessageBox.wnd\",\"Menus/MainMenu.wnd\"],"
		<< "\"shellLayouts\":[\"Menus/MainMenu.wnd\"],"
		<< "\"callbackOwners\":[\"MessageBoxSystem\",\"QuitMessageBoxSystem\",\"PassMessagesToParentSystem\"],"
		<< "\"shellCallbackNames\":[\"W3DMainMenuInit\",\"MainMenuSystem\",\"MainMenuShutdown\"],"
		<< "\"callbackPaths\":[\"W3DMainMenuInit->MainMenuInit\"],"
		<< "\"covered\":\"original WindowLayout load, Win32BIGFileSystem WindowZH.big mount, .wnd parser, W3DFunctionLexicon device layout-init lookup, original W3DMainMenuInit to MainMenuInit boundary, original Shell::showShell/Shell::push MainMenu.wnd stack ownership, MainMenu.wnd W3D init/system/shutdown callback-name binding, original message-box callback ownership, NameKey window id, and parsed GameWindow ownership\"}"
		<< "\n";
	return 0;
}
