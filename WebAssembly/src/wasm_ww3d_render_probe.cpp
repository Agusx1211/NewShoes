#include <algorithm>
#include <cstddef>
#include <cstdio>
#include <cctype>
#include <cstring>
#include <string>
#include <vector>

#include "PreRTS.h"

#include "Common/ArchiveFileSystem.h"
#include "Common/File.h"
#include "Common/FileSystem.h"
#include "Common/GlobalData.h"
#include "Common/GameMemory.h"
#include "Common/LocalFileSystem.h"
#include "Common/NameKeyGenerator.h"
#include "Common/SubsystemInterface.h"
#include "Common/UnicodeString.h"
#include "GameClient/DisplayStringManager.h"
#include "GameClient/GadgetPushButton.h"
#include "GameClient/GadgetStaticText.h"
#include "GameClient/GameFont.h"
#include "GameClient/GameText.h"
#include "GameClient/GUICallbacks.h"
#include "GameClient/HeaderTemplate.h"
#include "GameClient/GameWindow.h"
#include "GameClient/GameWindowManager.h"
#include "GameClient/GameWindowTransitions.h"
#include "GameClient/Image.h"
#include "GameClient/WinInstanceData.h"
#include "GameClient/WindowLayout.h"
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
#include "W3DDevice/GameClient/W3DDisplayString.h"
#include "W3DDevice/Common/W3DFunctionLexicon.h"
#include "W3DDevice/GameClient/W3DGadget.h"
#include "W3DDevice/GameClient/W3DGameFont.h"
#include "W3DDevice/GameClient/W3DGameWindowManager.h"
#include "W3DDevice/GameClient/W3DGUICallbacks.h"
#include "ww3dformat.h"
#include "W3DDevice/GameClient/W3DVideoBuffer.h"
#include "assetmgr.h"
#include "boxrobj.h"
#include "camera.h"
#include "coltype.h"
#include "ddsfile.h"
#include "ffactory.h"
#include "rect.h"
#include "render2d.h"
#include "render2dsentence.h"
#include "rinfo.h"
#include "scene.h"
#include "texture.h"
#include "wasm_browser_runtime_assets.h"
#include "wasm_d3d8_shim.h"
#include "wasm_ww3d_probe_lifetime.h"
#include "Win32Device/Common/Win32BIGFileSystem.h"
#include "Win32Device/Common/Win32LocalFileSystem.h"
#include "wwfile.h"
#include "ww3d.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

Bool parseLayoutBlock(File *inFile, char *buffer, UnsignedInt version, WindowLayoutInfo *info);

using WindowLayoutScriptRuntimeAnchor =
	Bool (*)(File *, char *, UnsignedInt, WindowLayoutInfo *);
__attribute__((used)) static WindowLayoutScriptRuntimeAnchor
	g_force_window_layout_script_runtime_link = parseLayoutBlock;

// This focused render target constructs a Display adapter without linking the
// full Display.cpp movie/debug teardown graph. The weak definitions below are
// replaced automatically if a broader target later links the original owner.
__attribute__((weak)) Display::Display()
{
	m_viewList = nullptr;
	m_width = 0;
	m_height = 0;
	m_bitDepth = 0;
	m_windowed = FALSE;
	m_videoBuffer = nullptr;
	m_videoStream = nullptr;
	m_debugDisplayCallback = nullptr;
	m_debugDisplayUserData = nullptr;
	m_debugDisplay = nullptr;
	m_letterBoxFadeLevel = 0.0f;
	m_letterBoxEnabled = FALSE;
	m_cinematicText = AsciiString::TheEmptyString;
	m_cinematicFont = nullptr;
	m_cinematicTextFrames = 0;
	m_movieHoldTime = -1;
	m_copyrightHoldTime = -1;
	m_elapsedMovieTime = 0;
	m_elapsedCopywriteTime = 0;
	m_copyrightDisplayString = nullptr;
	m_currentlyPlayingMovie.clear();
	m_letterBoxFadeStartTime = 0;
}

__attribute__((weak)) Display::~Display() {}

__attribute__((weak)) void Display::deleteViews()
{
	m_viewList = nullptr;
}

__attribute__((weak)) void Display::attachView(View *view)
{
	m_viewList = view;
}

__attribute__((weak)) void Display::drawViews() {}

__attribute__((weak)) void Display::updateViews() {}

__attribute__((weak)) void Display::draw() {}

__attribute__((weak)) void Display::setWidth(UnsignedInt width)
{
	m_width = width;
}

__attribute__((weak)) void Display::setHeight(UnsignedInt height)
{
	m_height = height;
}

__attribute__((weak)) Bool Display::setDisplayMode(UnsignedInt xres, UnsignedInt yres,
	UnsignedInt bitdepth, Bool windowed)
{
	m_width = xres;
	m_height = yres;
	m_bitDepth = bitdepth;
	m_windowed = windowed;
	return TRUE;
}

__attribute__((weak)) void Display::playLogoMovie(AsciiString, Int, Int) {}

__attribute__((weak)) void Display::playMovie(AsciiString) {}

__attribute__((weak)) void Display::stopMovie() {}

__attribute__((weak)) Bool Display::isMoviePlaying()
{
	return FALSE;
}

__attribute__((weak)) void Display::setDebugDisplayCallback(DebugDisplayCallback *callback,
	void *userData)
{
	m_debugDisplayCallback = callback;
	m_debugDisplayUserData = userData;
}

__attribute__((weak)) Display::DebugDisplayCallback *Display::getDebugDisplayCallback()
{
	return m_debugDisplayCallback;
}

__attribute__((weak)) void Display::reset()
{
	deleteViews();
}

__attribute__((weak)) void Display::update() {}

FunctionLexicon *TheFunctionLexicon = nullptr;

FunctionLexicon::FunctionLexicon()
{
	for (Int index = 0; index < MAX_FUNCTION_TABLES; ++index) {
		m_tables[index] = nullptr;
	}
}

FunctionLexicon::~FunctionLexicon() {}

void FunctionLexicon::init() {}

void FunctionLexicon::reset()
{
	init();
}

void FunctionLexicon::update() {}

Bool FunctionLexicon::validate()
{
	return TRUE;
}

void FunctionLexicon::loadTable(TableEntry *table, TableIndex tableIndex)
{
	if (table == nullptr || TheNameKeyGenerator == nullptr) {
		return;
	}

	for (TableEntry *entry = table; entry->name != nullptr; ++entry) {
		entry->key = TheNameKeyGenerator->nameToKey(AsciiString(entry->name));
	}
	m_tables[tableIndex] = table;
}

void *FunctionLexicon::keyToFunc(NameKeyType key, TableEntry *table)
{
	if (key == NAMEKEY_INVALID) {
		return nullptr;
	}

	for (TableEntry *entry = table; entry != nullptr && entry->key != NAMEKEY_INVALID; ++entry) {
		if (entry->key == key) {
			return entry->func;
		}
	}
	return nullptr;
}

void *FunctionLexicon::findFunction(NameKeyType key, TableIndex index)
{
	if (key == NAMEKEY_INVALID) {
		return nullptr;
	}

	if (index == TABLE_ANY) {
		for (Int table_index = 0; table_index < MAX_FUNCTION_TABLES; ++table_index) {
			void *func = keyToFunc(key, m_tables[table_index]);
			if (func != nullptr) {
				return func;
			}
		}
		return nullptr;
	}

	return keyToFunc(key, m_tables[index]);
}

GameWinDrawFunc FunctionLexicon::gameWinDrawFunc(NameKeyType key, TableIndex index)
{
	if (index == TABLE_ANY) {
		GameWinDrawFunc func =
			reinterpret_cast<GameWinDrawFunc>(findFunction(key, TABLE_GAME_WIN_DEVICEDRAW));
		if (func == nullptr) {
			func = reinterpret_cast<GameWinDrawFunc>(findFunction(key, TABLE_GAME_WIN_DRAW));
		}
		return func;
	}
	return reinterpret_cast<GameWinDrawFunc>(findFunction(key, index));
}

WindowLayoutInitFunc FunctionLexicon::winLayoutInitFunc(NameKeyType key, TableIndex index)
{
	if (index == TABLE_ANY) {
		WindowLayoutInitFunc func =
			reinterpret_cast<WindowLayoutInitFunc>(findFunction(key, TABLE_WIN_LAYOUT_DEVICEINIT));
		if (func == nullptr) {
			func = reinterpret_cast<WindowLayoutInitFunc>(findFunction(key, TABLE_WIN_LAYOUT_INIT));
		}
		return func;
	}
	return reinterpret_cast<WindowLayoutInitFunc>(findFunction(key, index));
}

DisplayStringManager::DisplayStringManager()
{
	m_stringList = nullptr;
	m_currentCheckpoint = nullptr;
}

DisplayStringManager::~DisplayStringManager() {}

void DisplayStringManager::link(DisplayString *string)
{
	if (string == nullptr) {
		return;
	}
	string->m_next = m_stringList;
	string->m_prev = nullptr;
	if (m_stringList != nullptr) {
		m_stringList->m_prev = string;
	}
	m_stringList = string;
}

void DisplayStringManager::unLink(DisplayString *string)
{
	if (string == nullptr) {
		return;
	}
	if (string->m_next != nullptr) {
		string->m_next->m_prev = string->m_prev;
	}
	if (string->m_prev != nullptr) {
		string->m_prev->m_next = string->m_next;
	} else if (m_stringList == string) {
		m_stringList = string->m_next;
	}
	string->m_next = nullptr;
	string->m_prev = nullptr;
}

namespace {

std::string g_ww3d_aabox_probe_json;
std::string g_ww3d_render2d_probe_json;
std::string g_ww3d_scene_camera_probe_json;
std::string g_ww3d_display_drawimage_probe_json;
std::string g_ww3d_display_video_buffer_probe_json;
std::string g_ww3d_display_drawimage_additive_probe_json;
std::string g_ww3d_display_drawimage_solid_probe_json;
std::string g_ww3d_display_drawimage_grayscale_probe_json;
std::string g_ww3d_display_drawimage_file_probe_json;
std::string g_ww3d_display_mapped_image_probe_json;
std::string g_ww3d_display_mapped_image_clip_probe_json;
std::string g_ww3d_display_mapped_image_unrotated_probe_json;
std::string g_ww3d_display_fillrect_probe_json;
std::string g_ww3d_window_repaint_probe_json;
std::string g_ww3d_window_layout_repaint_probe_json;
std::string g_ww3d_display_line_probe_json;
std::string g_ww3d_display_line_gradient_probe_json;
std::string g_ww3d_display_openrect_probe_json;
std::string g_ww3d_display_rectclock_probe_json;
std::string g_ww3d_display_remaining_rectclock_probe_json;
std::string g_ww3d_render2d_sentence_probe_json;
std::string g_ww3d_display_string_probe_json;
std::string g_ww3d_display_game_text_probe_json;

constexpr const char *kDisplayDrawImageFileTextureName = "cine_moon.tga";
constexpr const char *kDisplayDrawImageFileTextureArchiveEntry = "art\\textures\\cine_moon.dds";
constexpr const char *kMappedImageProbeName = "WatermarkChina";
constexpr const char *kMappedImageProbeTextureName = "SCShellUserInterface512_001.tga";
constexpr const char *kMappedImageProbeTextureArchiveEntry =
	"Data\\English\\Art\\Textures\\SCShellUserInterface512_001.tga";
constexpr const char *kMappedImageProbeSampleIni =
	"Data\\INI\\MappedImages\\TextureSize_512\\SCShellUserInterface512.INI";
constexpr const char *kUnrotatedMappedImageProbeName = "SAChinook_L";
constexpr const char *kUnrotatedMappedImageProbeTextureName = "SAUserInterface512_001.tga";
constexpr const char *kUnrotatedMappedImageProbeTextureArchiveEntry =
	"Data\\English\\Art\\Textures\\SAUserInterface512_001.tga";
constexpr const char *kUnrotatedMappedImageProbeSampleIni =
	"Data\\INI\\MappedImages\\TextureSize_512\\SAUserInterface512.INI";
constexpr const char *kMappedImageTextureSource =
	"ImageCollection::load mapped-image filename path via W3DDisplay::drawImage, WW3DAssetManager, TextureClass::Init, and runtime W3DFileSystem BIG archives";
constexpr const char *kUnrotatedMappedImageTextureSource =
	"ImageCollection::load non-rotated mapped-image filename path via W3DDisplay::drawImage, WW3DAssetManager, TextureClass::Init, and runtime W3DFileSystem BIG archives";

struct MappedImageDrawProbeSpec
{
	const char *source_name;
	const char *image_name;
	const char *texture_name;
	const char *texture_archive_entry;
	const char *sample_ini;
	const char *texture_source;
	UnsignedInt expected_status;
	bool expected_rotated;
	Int expected_width;
	Int expected_height;
	UINT expected_vertex_count;
	Int draw_left;
	Int draw_top;
	Int draw_right;
	Int draw_bottom;
};

constexpr MappedImageDrawProbeSpec kMappedImageProbeSpec = {
	"ww3d_display_mapped_image_probe",
	kMappedImageProbeName,
	kMappedImageProbeTextureName,
	kMappedImageProbeTextureArchiveEntry,
	kMappedImageProbeSampleIni,
	kMappedImageTextureSource,
	IMAGE_STATUS_ROTATED_90_CLOCKWISE,
	true,
	160,
	96,
	6,
	320,
	252,
	480,
	348,
};

constexpr MappedImageDrawProbeSpec kUnrotatedMappedImageProbeSpec = {
	"ww3d_display_mapped_image_unrotated_probe",
	kUnrotatedMappedImageProbeName,
	kUnrotatedMappedImageProbeTextureName,
	kUnrotatedMappedImageProbeTextureArchiveEntry,
	kUnrotatedMappedImageProbeSampleIni,
	kUnrotatedMappedImageTextureSource,
	IMAGE_STATUS_NONE,
	false,
	120,
	96,
	4,
	340,
	252,
	460,
	348,
};

bool succeeded(int result)
{
	return result == WW3D_ERROR_OK;
}

const char *bool_json(bool value)
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

class ProbeNullMissingFileFactory : public FileFactoryClass
{
public:
	explicit ProbeNullMissingFileFactory(FileFactoryClass *inner) : m_inner(inner) {}

	FileClass *Get_File(char const *filename) override
	{
		if (is_optional_startup_file(filename)) {
			return nullptr;
		}
		if (m_inner == nullptr) {
			return nullptr;
		}

		FileClass *file = m_inner->Get_File(filename);
		if (file != nullptr && !file->Is_Available(false)) {
			delete file;
			return nullptr;
		}
		return file;
	}

	void Return_File(FileClass *file) override
	{
		if (m_inner != nullptr && file != nullptr) {
			m_inner->Return_File(file);
		}
	}

private:
	static bool ascii_equals_ignore_case(const char *lhs, const char *rhs)
	{
		if (lhs == nullptr || rhs == nullptr) {
			return lhs == rhs;
		}

		while (*lhs != '\0' && *rhs != '\0') {
			const unsigned char left = static_cast<unsigned char>(*lhs);
			const unsigned char right = static_cast<unsigned char>(*rhs);
			if (std::tolower(left) != std::tolower(right)) {
				return false;
			}
			++lhs;
			++rhs;
		}
		return *lhs == '\0' && *rhs == '\0';
	}

	static bool is_optional_startup_file(const char *filename)
	{
		return ascii_equals_ignore_case(filename, "DAZZLE.INI") ||
			ascii_equals_ignore_case(filename, "w3danimsound.ini");
	}

	FileFactoryClass *m_inner;
};

bool equals_ignore_ascii_case(const std::string &lhs, const std::string &rhs)
{
	if (lhs.size() != rhs.size()) {
		return false;
	}
	for (std::size_t index = 0; index < lhs.size(); ++index) {
		const unsigned char left = static_cast<unsigned char>(lhs[index]);
		const unsigned char right = static_cast<unsigned char>(rhs[index]);
		if (std::tolower(left) != std::tolower(right)) {
			return false;
		}
	}
	return true;
}

void split_archive_path_for_probe(
	const std::string &archive_path,
	std::string &directory,
	std::string &file_mask)
{
	std::string normalized = archive_path;
	std::replace(normalized.begin(), normalized.end(), '\\', '/');

	const std::size_t slash = normalized.find_last_of('/');
	if (slash == std::string::npos) {
		directory.clear();
		file_mask = normalized;
		return;
	}

	directory = normalized.substr(0, slash + 1);
	file_mask = normalized.substr(slash + 1);
}

std::size_t count_mapped_images(ImageCollection &images)
{
	std::size_t count = 0;
	while (images.Enum(static_cast<unsigned>(count)) != nullptr) {
		++count;
	}
	return count;
}

Int count_layout_windows(WindowLayout *layout)
{
	Int count = 0;
	if (layout == nullptr) {
		return count;
	}

	for (GameWindow *window = layout->getFirstWindow(); window != nullptr;
		window = window->winGetNextInLayout()) {
		++count;
	}
	return count;
}

Int hide_window_tree_for_rect_probe(GameWindow *window)
{
	if (window == nullptr) {
		return 0;
	}

	Int hidden_count = 0;
	for (GameWindow *child = window->winGetChild(); child != nullptr; child = child->winGetNext()) {
		hidden_count += hide_window_tree_for_rect_probe(child);
	}
	window->winHide(TRUE);
	return hidden_count + 1;
}

Int hide_message_box_non_rect_children(GameWindow *root, GameWindow *message_parent)
{
	Int hidden_count = 0;
	if (root != nullptr) {
		for (GameWindow *child = root->winGetChild(); child != nullptr; child = child->winGetNext()) {
			if (child != message_parent) {
				hidden_count += hide_window_tree_for_rect_probe(child);
			}
		}
	}
	if (message_parent != nullptr) {
		for (GameWindow *child = message_parent->winGetChild(); child != nullptr; child = child->winGetNext()) {
			hidden_count += hide_window_tree_for_rect_probe(child);
		}
	}
	return hidden_count;
}

void get_window_rect(GameWindow *window, Int &x, Int &y, Int &width, Int &height)
{
	x = 0;
	y = 0;
	width = 0;
	height = 0;
	if (window == nullptr) {
		return;
	}
	window->winGetScreenPosition(&x, &y);
	window->winGetSize(&width, &height);
}

unsigned int color_red(Color color)
{
	return (static_cast<unsigned int>(color) >> 16u) & 0xffu;
}

unsigned int color_green(Color color)
{
	return (static_cast<unsigned int>(color) >> 8u) & 0xffu;
}

unsigned int color_blue(Color color)
{
	return static_cast<unsigned int>(color) & 0xffu;
}

unsigned int color_alpha(Color color)
{
	return (static_cast<unsigned int>(color) >> 24u) & 0xffu;
}

void fill_argb_texture_color(
	D3DLOCKED_RECT &locked_rect,
	unsigned int width,
	unsigned int height,
	unsigned char red,
	unsigned char green,
	unsigned char blue,
	unsigned char alpha)
{
	for (unsigned int y = 0; y < height; ++y) {
		unsigned char *row = static_cast<unsigned char *>(locked_rect.pBits) +
			static_cast<std::size_t>(locked_rect.Pitch) * y;
		for (unsigned int x = 0; x < width; ++x) {
			unsigned char *pixel = row + x * 4;
			pixel[0] = blue; // B
			pixel[1] = green; // G
			pixel[2] = red; // R
			pixel[3] = alpha; // A
		}
	}
}

void fill_argb_texture_red(D3DLOCKED_RECT &locked_rect, unsigned int width, unsigned int height)
{
	fill_argb_texture_color(locked_rect, width, height, 0xff, 0x00, 0x00, 0xff);
}

void fill_argb_texture_translucent_red(D3DLOCKED_RECT &locked_rect, unsigned int width, unsigned int height)
{
	fill_argb_texture_color(locked_rect, width, height, 0xff, 0x00, 0x00, 0x40);
}

void fill_argb_texture_grayscale_probe(D3DLOCKED_RECT &locked_rect, unsigned int width, unsigned int height)
{
	fill_argb_texture_color(locked_rect, width, height, 0x40, 0x80, 0xc0, 0xff);
}

void fill_xrgb_video_buffer_red(void *memory, unsigned int pitch, unsigned int width, unsigned int height)
{
	for (unsigned int y = 0; y < height; ++y) {
		unsigned char *row = static_cast<unsigned char *>(memory) +
			static_cast<std::size_t>(pitch) * y;
		for (unsigned int x = 0; x < width; ++x) {
			unsigned char *pixel = row + x * 4;
			pixel[0] = 0x00; // B
			pixel[1] = 0x00; // G
			pixel[2] = 0xff; // R
			pixel[3] = 0x00; // ignored by X8R8G8B8, forced opaque by the browser upload
		}
	}
}

class ProbeFontLibrary : public FontLibrary
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

class ProbeDisplayString : public DisplayString
{
	MEMORY_POOL_GLUE_WITH_EXPLICIT_CREATE(ProbeDisplayString, "ProbeDisplayString", 1, 1)

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

EMPTY_DTOR(ProbeDisplayString)

class ProbeDisplayStringManager : public DisplayStringManager
{
public:
	DisplayString *newDisplayString() override
	{
		DisplayString *string = newInstance(ProbeDisplayString);
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

class ProbeGameText : public GameTextInterface
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

class ProbeW3DWindowLayoutFunctionLexicon : public FunctionLexicon
{
public:
	void init() override
	{
		loadTable(m_systemTable, TABLE_GAME_WIN_SYSTEM);
		loadTable(m_inputTable, TABLE_GAME_WIN_INPUT);
		loadTable(m_drawTable, TABLE_GAME_WIN_DEVICEDRAW);
		loadTable(m_layoutInitTable, TABLE_WIN_LAYOUT_DEVICEINIT);
		loadTable(m_layoutUpdateTable, TABLE_WIN_LAYOUT_UPDATE);
		loadTable(m_layoutShutdownTable, TABLE_WIN_LAYOUT_SHUTDOWN);
	}

	void reset() override { init(); }
	void update() override {}

private:
	static TableEntry m_systemTable[];
	static TableEntry m_inputTable[];
	static TableEntry m_drawTable[];
	static TableEntry m_layoutInitTable[];
	static TableEntry m_layoutUpdateTable[];
	static TableEntry m_layoutShutdownTable[];
};

FunctionLexicon::TableEntry ProbeW3DWindowLayoutFunctionLexicon::m_systemTable[] = {
	{ NAMEKEY_INVALID, "GameWinDefaultSystem", GameWinDefaultSystem },
	{ NAMEKEY_INVALID, "PassMessagesToParentSystem", PassMessagesToParentSystem },
	{ NAMEKEY_INVALID, "MessageBoxSystem", MessageBoxSystem },
	{ NAMEKEY_INVALID, "QuitMessageBoxSystem", QuitMessageBoxSystem },
	{ NAMEKEY_INVALID, nullptr, nullptr },
};

FunctionLexicon::TableEntry ProbeW3DWindowLayoutFunctionLexicon::m_inputTable[] = {
	{ NAMEKEY_INVALID, "GameWinDefaultInput", GameWinDefaultInput },
	{ NAMEKEY_INVALID, "GadgetPushButtonInput", GadgetPushButtonInput },
	{ NAMEKEY_INVALID, "GadgetStaticTextInput", GadgetStaticTextInput },
	{ NAMEKEY_INVALID, nullptr, nullptr },
};

FunctionLexicon::TableEntry ProbeW3DWindowLayoutFunctionLexicon::m_drawTable[] = {
	{ NAMEKEY_INVALID, "W3DGameWinDefaultDraw", W3DGameWinDefaultDraw },
	{ NAMEKEY_INVALID, "W3DGadgetPushButtonDraw", W3DGadgetPushButtonDraw },
	{ NAMEKEY_INVALID, "W3DGadgetPushButtonImageDraw", W3DGadgetPushButtonImageDraw },
	{ NAMEKEY_INVALID, "W3DGadgetStaticTextDraw", W3DGadgetStaticTextDraw },
	{ NAMEKEY_INVALID, "W3DGadgetStaticTextImageDraw", W3DGadgetStaticTextImageDraw },
	{ NAMEKEY_INVALID, nullptr, nullptr },
};

FunctionLexicon::TableEntry ProbeW3DWindowLayoutFunctionLexicon::m_layoutInitTable[] = {
	{ NAMEKEY_INVALID, nullptr, nullptr },
};

FunctionLexicon::TableEntry ProbeW3DWindowLayoutFunctionLexicon::m_layoutUpdateTable[] = {
	{ NAMEKEY_INVALID, nullptr, nullptr },
};

FunctionLexicon::TableEntry ProbeW3DWindowLayoutFunctionLexicon::m_layoutShutdownTable[] = {
	{ NAMEKEY_INVALID, nullptr, nullptr },
};

class ProbeForwardingW3DDisplay : public Display
{
public:
	explicit ProbeForwardingW3DDisplay(W3DDisplay *display = nullptr) : m_w3dDisplay(display) {}

	void setW3DDisplay(W3DDisplay *display)
	{
		m_w3dDisplay = display;
	}

	void configure(UnsignedInt width, UnsignedInt height, UnsignedInt bitDepth, Bool windowed)
	{
		m_width = width;
		m_height = height;
		m_bitDepth = bitDepth;
		m_windowed = windowed;
	}

	void doSmartAssetPurgeAndPreload(const char *) override {}
#if defined(_DEBUG) || defined(_INTERNAL)
	void dumpAssetUsage(const char *) override {}
#endif
	VideoBuffer *createVideoBuffer() override { return nullptr; }
	void setClipRegion(IRegion2D *region) override
	{
		if (m_w3dDisplay != nullptr && region != nullptr) {
			m_w3dDisplay->W3DDisplay::setClipRegion(region);
		}
	}
	Bool isClippingEnabled() override
	{
		return m_w3dDisplay != nullptr ? m_w3dDisplay->W3DDisplay::isClippingEnabled() : FALSE;
	}
	void enableClipping(Bool onoff) override
	{
		if (m_w3dDisplay != nullptr) {
			m_w3dDisplay->W3DDisplay::enableClipping(onoff);
		}
	}
	void setTimeOfDay(TimeOfDay) override {}
	void createLightPulse(const Coord3D *, const RGBColor *, Real, Real, UnsignedInt, UnsignedInt) override {}
	void drawLine(Int startX, Int startY, Int endX, Int endY, Real lineWidth, UnsignedInt lineColor) override
	{
		++m_lineDraws;
		if (m_w3dDisplay != nullptr) {
			m_w3dDisplay->W3DDisplay::drawLine(startX, startY, endX, endY, lineWidth, lineColor);
		}
	}
	void drawLine(Int startX, Int startY, Int endX, Int endY, Real lineWidth,
		UnsignedInt lineColor1, UnsignedInt lineColor2) override
	{
		++m_lineDraws;
		if (m_w3dDisplay != nullptr) {
			m_w3dDisplay->W3DDisplay::drawLine(startX, startY, endX, endY, lineWidth,
				lineColor1, lineColor2);
		}
	}
	void drawOpenRect(Int startX, Int startY, Int width, Int height, Real lineWidth,
		UnsignedInt lineColor) override
	{
		++m_openRectDraws;
		if (m_w3dDisplay != nullptr) {
			m_w3dDisplay->W3DDisplay::drawOpenRect(startX, startY, width, height, lineWidth,
				lineColor);
		}
	}
	void drawFillRect(Int startX, Int startY, Int width, Int height, UnsignedInt color) override
	{
		++m_fillRectDraws;
		if (m_w3dDisplay != nullptr) {
			m_w3dDisplay->W3DDisplay::drawFillRect(startX, startY, width, height, color);
		}
	}
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
	Int getLastFrameDrawCalls() override { return m_lineDraws + m_openRectDraws + m_fillRectDraws; }
	Int openRectDraws() const { return m_openRectDraws; }
	Int fillRectDraws() const { return m_fillRectDraws; }

private:
	W3DDisplay *m_w3dDisplay = nullptr;
	Int m_lineDraws = 0;
	Int m_openRectDraws = 0;
	Int m_fillRectDraws = 0;
};

struct ProbeW3DDisplayStorage
{
	W3DDisplay *prepare_for_2d_probe()
	{
		// Keep this as raw storage. Calling the W3DDisplay constructor retains
		// its full vtable/destructor surface and pulls display-string/font
		// singletons into these minimal probes. 2D draw methods are called
		// non-virtually below and read only the fields initialized here.
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
		// The real W3DDisplay destructor tears down global display/device
		// singletons that this focused drawImage probe never initializes.
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

} // namespace

__attribute__((weak)) void W3DLeftHUDDraw(GameWindow *, WinInstanceData *) {}
__attribute__((weak)) void W3DCameoMovieDraw(GameWindow *, WinInstanceData *) {}
__attribute__((weak)) void W3DRightHUDDraw(GameWindow *, WinInstanceData *) {}
__attribute__((weak)) void W3DPowerDraw(GameWindow *, WinInstanceData *) {}
__attribute__((weak)) void W3DMainMenuDraw(GameWindow *, WinInstanceData *) {}
__attribute__((weak)) void W3DMainMenuFourDraw(GameWindow *, WinInstanceData *) {}
__attribute__((weak)) void W3DMetalBarMenuDraw(GameWindow *, WinInstanceData *) {}
__attribute__((weak)) void W3DCreditsMenuDraw(GameWindow *, WinInstanceData *) {}
__attribute__((weak)) void W3DClockDraw(GameWindow *, WinInstanceData *) {}
__attribute__((weak)) void W3DMainMenuMapBorder(GameWindow *, WinInstanceData *) {}
__attribute__((weak)) void W3DMainMenuButtonDropShadowDraw(GameWindow *, WinInstanceData *) {}
__attribute__((weak)) void W3DMainMenuRandomTextDraw(GameWindow *, WinInstanceData *) {}
__attribute__((weak)) void W3DThinBorderDraw(GameWindow *, WinInstanceData *) {}
__attribute__((weak)) void W3DShellMenuSchemeDraw(GameWindow *, WinInstanceData *) {}
__attribute__((weak)) void W3DCommandBarBackgroundDraw(GameWindow *, WinInstanceData *) {}
__attribute__((weak)) void W3DCommandBarTopDraw(GameWindow *, WinInstanceData *) {}
__attribute__((weak)) void W3DCommandBarGenExpDraw(GameWindow *, WinInstanceData *) {}
__attribute__((weak)) void W3DCommandBarHelpPopupDraw(GameWindow *, WinInstanceData *) {}
__attribute__((weak)) void W3DCommandBarGridDraw(GameWindow *, WinInstanceData *) {}
__attribute__((weak)) void W3DCommandBarForegroundDraw(GameWindow *, WinInstanceData *) {}
__attribute__((weak)) void W3DNoDraw(GameWindow *, WinInstanceData *) {}
__attribute__((weak)) void W3DDrawMapPreview(GameWindow *, WinInstanceData *) {}
__attribute__((weak)) void W3DMainMenuInit(WindowLayout *, void *) {}

extern "C" {

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_aabox()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool allocated = false;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		BoxRenderObjClass::Set_Box_Display_Mask(COLL_TYPE_ALL);
		WW3D::Set_Thumbnail_Enabled(false);

		CameraClass *camera = W3DNEW CameraClass();
		AABoxRenderObjClass *box = NEW_REF(AABoxRenderObjClass, ());
		allocated = camera != nullptr && box != nullptr;

		if (allocated) {
			box->Set_Local_Center_Extent(Vector3(0.0f, 0.0f, 0.0f), Vector3(1.0f, 2.0f, 3.0f));
			box->Set_Color(Vector3(0.1f, 0.85f, 0.3f));
			box->Set_Opacity(1.0f);

			RenderInfoClass render_info(*camera);
			begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
			if (succeeded(begin_render_result)) {
				render_result = WW3D::Render(*box, render_info);
				end_render_result = WW3D::End_Render(false);
			}
		}

		if (box != nullptr) {
			box->Release_Ref();
		}
		if (camera != nullptr) {
			camera->Release_Ref();
		}
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		allocated &&
		succeeded(begin_render_result) &&
		succeeded(render_result) &&
		succeeded(end_render_result) &&
		state->create_device_calls >= 1 &&
		state->create_vertex_buffer_calls >= 1 &&
		state->create_index_buffer_calls >= 1 &&
		state->set_stream_source_calls >= 1 &&
		state->set_indices_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_transform_calls >= 3 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 8 &&
		state->last_draw_primitive_count == 12 &&
		state->last_draw_vertex_buffer_bytes > 0 &&
		state->last_draw_index_buffer_bytes > 0 &&
		state->last_draw_index_format == D3DFMT_INDEX16 &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		(state->last_draw_transform_mask & 7u) == 7u;

	char buffer[3200];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_aabox_render_probe\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,\"beginRender\":%d,"
		"\"render\":%d,\"endRender\":%d,\"allocated\":%s},"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,\"createIndexBuffer\":%u,"
		"\"createVertexBuffer\":%u,\"setStreamSource\":%u,\"setIndices\":%u,"
		"\"drawIndexed\":%u,\"setTransform\":%u,\"lastTransformState\":%d,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"browserBufferRelease\":%u,"
		"\"clear\":%u,\"present\":%u},"
		"\"draw\":{\"primitiveType\":%d,\"startVertex\":%u,\"minVertexIndex\":%u,"
		"\"vertexCount\":%u,\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"vertexOffset\":%u,\"vertexBytes\":%u,"
		"\"vertexChecksum\":%lu,\"indexBufferId\":%u,\"indexOffset\":%u,"
		"\"indexBytes\":%u,\"indexChecksum\":%lu,\"indexFormat\":%d,"
		"\"transformMask\":%u,"
		"\"renderState\":{\"cullMode\":%lu,\"zEnable\":%lu,"
		"\"zWriteEnable\":%lu,\"zFunc\":%lu,\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"blendOp\":%lu,"
		"\"alphaTestEnable\":%lu,\"alphaFunc\":%lu,\"alphaRef\":%lu,"
		"\"colorWriteEnable\":%lu}}}",
		bool_json(ok),
		init_result,
		set_device_result,
		begin_render_result,
		render_result,
		end_render_result,
		bool_json(allocated),
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->create_index_buffer_calls : 0,
		state != nullptr ? state->create_vertex_buffer_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		static_cast<int>(state != nullptr ? state->last_set_transform_state : D3DTS_FORCE_DWORD),
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_start_vertex : 0,
		state != nullptr ? state->last_draw_min_vertex_index : 0,
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_vertex_buffer_offset : 0,
		state != nullptr ? state->last_draw_vertex_buffer_bytes : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_draw_vertex_buffer_checksum : 0),
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_offset : 0,
		state != nullptr ? state->last_draw_index_buffer_bytes : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_draw_index_buffer_checksum : 0),
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.cull_mode : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.z_enable : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.z_write_enable : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.z_func : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.alpha_blend_enable : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.src_blend : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.dest_blend : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.blend_op : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.alpha_test_enable : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.alpha_func : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.alpha_ref : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.color_write_enable : 0));

	g_ww3d_aabox_probe_json = buffer;
	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}
	return g_ww3d_aabox_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_scene_camera()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool camera_created = false;
	bool scene_created = false;
	bool render_object_created = false;
	bool object_added = false;

	CameraClass *camera = nullptr;
	SimpleSceneClass *scene = nullptr;
	AABoxRenderObjClass *box = nullptr;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
		BoxRenderObjClass::Set_Box_Display_Mask(COLL_TYPE_ALL);

		camera = W3DNEW CameraClass();
		scene = NEW_REF(SimpleSceneClass, ());
		box = NEW_REF(AABoxRenderObjClass, ());
		camera_created = camera != nullptr;
		scene_created = scene != nullptr;
		render_object_created = box != nullptr;
	}

	if (camera_created && scene_created && render_object_created) {
		box->Set_Local_Center_Extent(Vector3(0.0f, 0.0f, 0.0f), Vector3(1.0f, 2.0f, 3.0f));
		box->Set_Color(Vector3(0.1f, 0.85f, 0.3f));
		box->Set_Opacity(1.0f);
		box->Set_Force_Visible(true);
		scene->Add_Render_Object(box);
		object_added = box->Peek_Scene() == scene;

		begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			render_result = WW3D::Render(scene, camera);
			end_render_result = WW3D::End_Render(false);
		}
	}

	if (scene != nullptr && box != nullptr && object_added) {
		scene->Remove_Render_Object(box);
	}
	REF_PTR_RELEASE(box);
	REF_PTR_RELEASE(scene);
	REF_PTR_RELEASE(camera);

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		camera_created &&
		scene_created &&
		render_object_created &&
		object_added &&
		succeeded(begin_render_result) &&
		succeeded(render_result) &&
		succeeded(end_render_result) &&
		state->create_device_calls >= 1 &&
		state->create_vertex_buffer_calls >= 1 &&
		state->create_index_buffer_calls >= 1 &&
		state->set_stream_source_calls >= 1 &&
		state->set_indices_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_transform_calls >= 3 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 8 &&
		state->last_draw_primitive_count == 12 &&
		state->last_draw_vertex_buffer_bytes > 0 &&
		state->last_draw_index_buffer_bytes > 0 &&
		state->last_draw_index_format == D3DFMT_INDEX16 &&
		(state->last_draw_transform_mask & 7u) == 7u;

	char buffer[3900];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_scene_camera_probe\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,\"beginRender\":%d,"
		"\"render\":%d,\"endRender\":%d,\"cameraCreated\":%s,"
		"\"sceneCreated\":%s,\"renderObjectCreated\":%s,\"objectAdded\":%s},"
		"\"calls\":{\"createDevice\":%u,\"createIndexBuffer\":%u,"
		"\"createVertexBuffer\":%u,\"setStreamSource\":%u,\"setIndices\":%u,"
		"\"drawIndexed\":%u,\"setTransform\":%u,\"lastTransformState\":%d,"
		"\"setViewport\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"browserBufferRelease\":%u,\"clear\":%u,\"present\":%u},"
		"\"viewport\":{\"x\":%u,\"y\":%u,\"width\":%u,\"height\":%u,"
		"\"minZ\":%.3f,\"maxZ\":%.3f},"
		"\"draw\":{\"primitiveType\":%d,\"startVertex\":%u,\"minVertexIndex\":%u,"
		"\"vertexCount\":%u,\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"vertexOffset\":%u,\"vertexBytes\":%u,"
		"\"vertexChecksum\":%lu,\"indexBufferId\":%u,\"indexOffset\":%u,"
		"\"indexBytes\":%u,\"indexChecksum\":%lu,\"indexFormat\":%d,"
		"\"transformMask\":%u,"
		"\"renderState\":{\"cullMode\":%lu,\"zEnable\":%lu,"
		"\"zWriteEnable\":%lu,\"zFunc\":%lu,\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"blendOp\":%lu,"
		"\"alphaTestEnable\":%lu,\"alphaFunc\":%lu,\"alphaRef\":%lu,"
		"\"colorWriteEnable\":%lu}}}",
		bool_json(ok),
		init_result,
		set_device_result,
		begin_render_result,
		render_result,
		end_render_result,
		bool_json(camera_created),
		bool_json(scene_created),
		bool_json(render_object_created),
		bool_json(object_added),
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_index_buffer_calls : 0,
		state != nullptr ? state->create_vertex_buffer_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		static_cast<int>(state != nullptr ? state->last_set_transform_state : D3DTS_FORCE_DWORD),
		state != nullptr ? state->set_viewport_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		static_cast<unsigned int>(state != nullptr ? state->viewport.X : 0),
		static_cast<unsigned int>(state != nullptr ? state->viewport.Y : 0),
		static_cast<unsigned int>(state != nullptr ? state->viewport.Width : 0),
		static_cast<unsigned int>(state != nullptr ? state->viewport.Height : 0),
		state != nullptr ? state->viewport.MinZ : 0.0f,
		state != nullptr ? state->viewport.MaxZ : 0.0f,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_start_vertex : 0,
		state != nullptr ? state->last_draw_min_vertex_index : 0,
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_vertex_buffer_offset : 0,
		state != nullptr ? state->last_draw_vertex_buffer_bytes : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_draw_vertex_buffer_checksum : 0),
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_offset : 0,
		state != nullptr ? state->last_draw_index_buffer_bytes : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_draw_index_buffer_checksum : 0),
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.cull_mode : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.z_enable : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.z_write_enable : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.z_func : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.alpha_blend_enable : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.src_blend : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.dest_blend : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.blend_op : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.alpha_test_enable : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.alpha_func : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.alpha_ref : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.color_write_enable : 0));

	g_ww3d_scene_camera_probe_json = buffer;
	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}
	return g_ww3d_scene_camera_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_render2d_textured_quad()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	constexpr unsigned int texture_width = 2;
	constexpr unsigned int texture_height = 2;

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	HRESULT texture_create_result = E_FAIL;
	HRESULT texture_lock_result = E_FAIL;
	HRESULT texture_unlock_result = E_FAIL;
	bool texture_created = false;
	bool render2d_called = false;
	UINT texture_id = 0;

	TextureClass *texture = nullptr;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
		texture = NEW_REF(TextureClass, (
			texture_width,
			texture_height,
			WW3D_FORMAT_A8R8G8B8,
			MIP_LEVELS_1));
		texture_created = texture != nullptr && texture->Peek_D3D_Texture() != nullptr;
		texture_create_result = texture_created ? D3D_OK : E_FAIL;
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		texture_id = state != nullptr ? state->last_browser_texture_id : 0;
	}

	if (texture_created) {
		D3DLOCKED_RECT locked_rect = {};
		texture_lock_result = texture->Peek_D3D_Texture()->LockRect(0, &locked_rect, nullptr, 0);
		if (SUCCEEDED(texture_lock_result) && locked_rect.pBits != nullptr) {
			fill_argb_texture_red(locked_rect, texture_width, texture_height);
		}
		texture_unlock_result = texture->Peek_D3D_Texture()->UnlockRect(0);
	}

	if (texture != nullptr) {
		Render2DClass::Set_Screen_Resolution(RectClass(0.0f, 0.0f, 800.0f, 600.0f));

		{
			Render2DClass renderer(texture);
			renderer.Set_Coordinate_Range(RectClass(0.0f, 0.0f, 800.0f, 600.0f));
			renderer.Add_Quad(
				RectClass(300.0f, 220.0f, 500.0f, 380.0f),
				RectClass(0.0f, 0.0f, 1.0f, 1.0f),
				0xffffffffUL);

			begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
			if (succeeded(begin_render_result)) {
				renderer.Render();
				render2d_called = true;
				end_render_result = WW3D::End_Render(false);
			}
		}

		REF_PTR_RELEASE(texture);
	}

	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		SUCCEEDED(texture_create_result) &&
		SUCCEEDED(texture_lock_result) &&
		SUCCEEDED(texture_unlock_result) &&
		texture_created &&
		succeeded(begin_render_result) &&
		render2d_called &&
		succeeded(end_render_result) &&
		texture_id != 0 &&
		state->create_device_calls >= 1 &&
		state->create_texture_calls >= 2 &&
		state->texture_lock_rect_calls >= 1 &&
		state->texture_unlock_rect_calls >= 1 &&
		state->create_vertex_buffer_calls >= 1 &&
		state->create_index_buffer_calls >= 1 &&
		state->browser_texture_create_calls >= 1 &&
		state->browser_texture_update_calls >= 1 &&
		state->browser_texture_bind_calls >= 2 &&
		state->browser_texture_release_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_texture_calls >= 2 &&
		state->set_stream_source_calls >= 1 &&
		state->set_indices_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 4 &&
		state->last_draw_primitive_count == 2 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_bytes >= 4 * 44 &&
		state->last_draw_index_buffer_bytes >= 6 * 2 &&
		state->last_draw_index_format == D3DFMT_INDEX16 &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		(state->last_draw_transform_mask & 7u) == 7u &&
		draw_state != nullptr &&
		draw_state->alpha_blend_enable == TRUE &&
		draw_state->src_blend == D3DBLEND_SRCALPHA &&
		draw_state->dest_blend == D3DBLEND_INVSRCALPHA &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_MODULATE &&
		stage0->values[D3DTSS_COLORARG1] == D3DTA_TEXTURE &&
		stage0->values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	char buffer[5200];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_render2d_textured_quad_probe\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,\"textureCreate\":%ld,"
		"\"textureLock\":%ld,\"textureUnlock\":%ld,\"textureCreated\":%s,"
		"\"beginRender\":%d,\"render2dCalled\":%s,\"endRender\":%d},"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"textureLockRect\":%u,\"textureUnlockRect\":%u,"
		"\"createVertexBuffer\":%u,\"createIndexBuffer\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"browserTextureRelease\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"browserBufferRelease\":%u,\"setTexture\":%u,"
		"\"setTextureStageState\":%u,\"setStreamSource\":%u,"
		"\"setIndices\":%u,\"drawIndexed\":%u,\"setTransform\":%u,"
		"\"clear\":%u,\"present\":%u},"
		"\"texture\":{\"id\":%u,\"format\":%u,\"width\":%u,\"height\":%u,"
		"\"expectedCenter\":[255,0,0,255],\"lastBindStage\":%u,"
		"\"lastBindId\":%u},"
		"\"draw\":{\"primitiveType\":%d,\"startVertex\":%u,\"minVertexIndex\":%u,"
		"\"vertexCount\":%u,\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"vertexOffset\":%u,\"vertexBytes\":%u,"
		"\"vertexChecksum\":%lu,\"indexBufferId\":%u,\"indexOffset\":%u,"
		"\"indexBytes\":%u,\"indexChecksum\":%lu,\"indexFormat\":%d,"
		"\"transformMask\":%u,"
		"\"renderState\":{\"cullMode\":%lu,\"zEnable\":%lu,"
		"\"zWriteEnable\":%lu,\"zFunc\":%lu,\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"blendOp\":%lu,"
		"\"alphaTestEnable\":%lu,\"alphaFunc\":%lu,\"alphaRef\":%lu,"
		"\"colorWriteEnable\":%lu,\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,\"colorArg2\":%lu,"
		"\"alphaOp\":%lu,\"alphaArg1\":%lu,\"alphaArg2\":%lu,"
		"\"minFilter\":%lu,\"magFilter\":%lu,\"mipFilter\":%lu,"
		"\"addressU\":%lu,\"addressV\":%lu,\"texCoordIndex\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu,\"texCoordIndex\":%lu}]}}}",
		bool_json(ok),
		init_result,
		set_device_result,
		static_cast<long>(texture_create_result),
		static_cast<long>(texture_lock_result),
		static_cast<long>(texture_unlock_result),
		bool_json(texture_created),
		begin_render_result,
		bool_json(render2d_called),
		end_render_result,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->texture_lock_rect_calls : 0,
		state != nullptr ? state->texture_unlock_rect_calls : 0,
		state != nullptr ? state->create_vertex_buffer_calls : 0,
		state != nullptr ? state->create_index_buffer_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		texture_id,
		static_cast<unsigned int>(D3DFMT_A8R8G8B8),
		texture_width,
		texture_height,
		state != nullptr ? state->last_browser_texture_bind_stage : 0,
		state != nullptr ? state->last_browser_texture_bind_id : 0,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_start_vertex : 0,
		state != nullptr ? state->last_draw_min_vertex_index : 0,
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_vertex_buffer_offset : 0,
		state != nullptr ? state->last_draw_vertex_buffer_bytes : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_draw_vertex_buffer_checksum : 0),
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_offset : 0,
		state != nullptr ? state->last_draw_index_buffer_bytes : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_draw_index_buffer_checksum : 0),
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->cull_mode) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->z_enable) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->z_write_enable) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->z_func) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->alpha_blend_enable) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->src_blend) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->dest_blend) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->blend_op) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->alpha_test_enable) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->alpha_func) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->alpha_ref) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->color_write_enable) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_COLOROP]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_COLORARG1]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_COLORARG2]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_ALPHAOP]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_ALPHAARG1]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_ALPHAARG2]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_MINFILTER]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_MAGFILTER]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_MIPFILTER]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_ADDRESSU]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_ADDRESSV]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_TEXCOORDINDEX]) : 0,
		stage1 != nullptr ? static_cast<unsigned long>(stage1->values[D3DTSS_COLOROP]) : 0,
		stage1 != nullptr ? static_cast<unsigned long>(stage1->values[D3DTSS_TEXCOORDINDEX]) : 0);

	g_ww3d_render2d_probe_json = buffer;
	return g_ww3d_render2d_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_render2d_sentence()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	const WCHAR text[] = L"ZEROHOUR";
	const char *font_face = "Arial";
	constexpr int point_size = 28;
	constexpr unsigned long text_color = 0xffffffffUL;

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool used_existing_asset_manager = false;
	bool asset_manager_created = false;
	bool font_created = false;
	bool sentence_built = false;
	bool sentence_drawn = false;
	bool sentence_rendered = false;
	int refs_after_get = 0;
	int char_height = 0;
	float text_extent_x = 0.0f;
	float text_extent_y = 0.0f;
	float draw_left = 0.0f;
	float draw_top = 0.0f;
	float draw_right = 0.0f;
	float draw_bottom = 0.0f;

	WW3DAssetManager *asset_manager = nullptr;
	FontCharsClass *font = nullptr;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
		Render2DClass::Set_Screen_Resolution(RectClass(0.0f, 0.0f, 800.0f, 600.0f));

		asset_manager = WW3DAssetManager::Get_Instance();
		used_existing_asset_manager = asset_manager != nullptr;
		if (asset_manager == nullptr) {
			asset_manager = W3DNEW WW3DAssetManager();
			asset_manager_created = asset_manager != nullptr;
		}
	}

	if (asset_manager != nullptr) {
		font = asset_manager->Get_FontChars(font_face, point_size, false);
		font_created = font != nullptr;
	}

	if (font != nullptr) {
		refs_after_get = font->Num_Refs();
		char_height = font->Get_Char_Height();

		{
			Render2DSentenceClass sentence;
			sentence.Set_Font(font);
			font->Release_Ref();
			font = nullptr;

			sentence.Set_Texture_Size_Hint(128);
			sentence.Set_Location(Vector2(300.0f, 260.0f));
			const Vector2 text_extent = sentence.Get_Text_Extents(text);
			text_extent_x = text_extent.X;
			text_extent_y = text_extent.Y;
			sentence.Build_Sentence(text, nullptr, nullptr);
			sentence_built = true;
			sentence.Draw_Sentence(text_color);
			sentence_drawn = true;

			const RectClass &draw_extents = sentence.Get_Draw_Extents();
			draw_left = draw_extents.Left;
			draw_top = draw_extents.Top;
			draw_right = draw_extents.Right;
			draw_bottom = draw_extents.Bottom;

			begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
			if (succeeded(begin_render_result)) {
				sentence.Render();
				sentence_rendered = true;
				end_render_result = WW3D::End_Render(false);
			}
		}
	}

	if (font != nullptr) {
		font->Release_Ref();
		font = nullptr;
	}

	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}
	if (asset_manager_created && asset_manager != nullptr) {
		delete asset_manager;
		asset_manager = nullptr;
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		(asset_manager_created || used_existing_asset_manager) &&
		font_created &&
		refs_after_get >= 2 &&
		char_height > 0 &&
		text_extent_x > 0.0f &&
		text_extent_y > 0.0f &&
		draw_right > draw_left &&
		draw_bottom > draw_top &&
		sentence_built &&
		sentence_drawn &&
		succeeded(begin_render_result) &&
		sentence_rendered &&
		succeeded(end_render_result) &&
		state->copy_rects_calls >= 1 &&
		state->last_copy_rects_format == D3DFMT_A4R4G4B4 &&
		state->last_copy_rects_uploaded_texture_id != 0 &&
		state->browser_texture_create_calls >= 1 &&
		state->browser_texture_update_calls >= 1 &&
		state->browser_texture_bind_calls >= 1 &&
		state->create_vertex_buffer_calls >= 1 &&
		state->create_index_buffer_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_texture_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count >= 4 &&
		state->last_draw_primitive_count >= 2 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_bytes >= 4 * 44 &&
		state->last_draw_index_buffer_bytes >= 6 * 2 &&
		state->last_draw_index_format == D3DFMT_INDEX16 &&
		draw_state != nullptr &&
		draw_state->alpha_blend_enable == TRUE &&
		draw_state->src_blend == D3DBLEND_SRCALPHA &&
		draw_state->dest_blend == D3DBLEND_INVSRCALPHA &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_MODULATE &&
		stage0->values[D3DTSS_COLORARG1] == D3DTA_TEXTURE &&
		stage0->values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	char buffer[5600];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_render2d_sentence_probe\","
		"\"ok\":%s,"
		"\"text\":\"ZEROHOUR\","
		"\"font\":{\"face\":\"%s\",\"pointSize\":%d,\"created\":%s,"
		"\"assetManagerCreated\":%s,\"usedExistingAssetManager\":%s,"
		"\"refsAfterGet\":%d,\"charHeight\":%d},"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
		"\"sentenceBuilt\":%s,\"sentenceDrawn\":%s,\"beginRender\":%d,"
		"\"sentenceRendered\":%s,\"endRender\":%d},"
		"\"extents\":{\"text\":{\"x\":%.2f,\"y\":%.2f},"
		"\"draw\":{\"left\":%.2f,\"top\":%.2f,\"right\":%.2f,\"bottom\":%.2f}},"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"copyRects\":%u,\"browserTextureCreate\":%u,"
		"\"browserTextureUpdate\":%u,\"browserTextureBind\":%u,"
		"\"browserTextureRelease\":%u,\"createVertexBuffer\":%u,"
		"\"createIndexBuffer\":%u,\"browserBufferCreate\":%u,"
		"\"browserBufferUpdate\":%u,\"setTexture\":%u,"
		"\"setTextureStageState\":%u,\"setStreamSource\":%u,"
		"\"setIndices\":%u,\"drawIndexed\":%u},"
		"\"copyRects\":{\"rectCount\":%u,\"width\":%u,\"height\":%u,"
		"\"format\":%u,\"uploadedTextureId\":%u},"
		"\"texture\":{\"id\":%u,\"format\":%u,\"width\":%u,\"height\":%u,"
		"\"checksum\":%lu,\"lastBindStage\":%u,\"lastBindId\":%u},"
		"\"draw\":{\"primitiveType\":%d,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,\"vertexBufferId\":%u,"
		"\"indexBufferId\":%u,\"vertexBytes\":%u,\"indexBytes\":%u,"
		"\"indexFormat\":%d,\"renderState\":{\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,\"colorArg2\":%lu,"
		"\"alphaOp\":%lu,\"alphaArg1\":%lu,\"alphaArg2\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu}]}}}",
		bool_json(ok),
		font_face,
		point_size,
		bool_json(font_created),
		bool_json(asset_manager_created),
		bool_json(used_existing_asset_manager),
		refs_after_get,
		char_height,
		init_result,
		set_device_result,
		bool_json(sentence_built),
		bool_json(sentence_drawn),
		begin_render_result,
		bool_json(sentence_rendered),
		end_render_result,
		static_cast<double>(text_extent_x),
		static_cast<double>(text_extent_y),
		static_cast<double>(draw_left),
		static_cast<double>(draw_top),
		static_cast<double>(draw_right),
		static_cast<double>(draw_bottom),
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->copy_rects_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->create_vertex_buffer_calls : 0,
		state != nullptr ? state->create_index_buffer_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->last_copy_rects_rect_count : 0,
		state != nullptr ? state->last_copy_rects_width : 0,
		state != nullptr ? state->last_copy_rects_height : 0,
		static_cast<unsigned int>(state != nullptr ? state->last_copy_rects_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_copy_rects_uploaded_texture_id : 0,
		state != nullptr ? state->last_copy_rects_uploaded_texture_id : 0,
		static_cast<unsigned int>(D3DFMT_A4R4G4B4),
		state != nullptr ? state->last_browser_texture_width : 0,
		state != nullptr ? state->last_browser_texture_height : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_browser_texture_checksum : 0),
		state != nullptr ? state->last_browser_texture_bind_stage : 0,
		state != nullptr ? state->last_browser_texture_bind_id : 0,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		state != nullptr ? state->last_draw_vertex_buffer_bytes : 0,
		state != nullptr ? state->last_draw_index_buffer_bytes : 0,
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->alpha_blend_enable) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->src_blend) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->dest_blend) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_COLOROP]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_COLORARG1]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_COLORARG2]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_ALPHAOP]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_ALPHAARG1]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_ALPHAARG2]) : 0,
		stage1 != nullptr ? static_cast<unsigned long>(stage1->values[D3DTSS_COLOROP]) : 0);

	g_ww3d_render2d_sentence_probe_json = buffer;
	return g_ww3d_render2d_sentence_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_string()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	const char *text = "DISPLAY";
	const char *font_face = "Arial";
	constexpr int point_size = 28;
	constexpr int draw_x = 300;
	constexpr int draw_y = 260;
	constexpr int drop_x = 2;
	constexpr int drop_y = 2;
	const Color text_color = GameMakeColor(255, 255, 255, 255);
	const Color drop_color = GameMakeColor(48, 48, 48, 255);

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool used_existing_asset_manager = false;
	bool asset_manager_created = false;
	bool used_existing_font_library = false;
	bool font_library_created = false;
	bool normal_font_loaded = false;
	bool bold_font_loaded = false;
	bool display_string_allocated = false;
	bool text_set = false;
	bool font_set = false;
	bool size_computed = false;
	bool draw_called = false;
	int text_length = 0;
	int normal_font_height = 0;
	int bold_font_height = 0;
	int display_width = 0;
	int display_height = 0;
	int display_width_via_chars = 0;

	WW3DAssetManager *asset_manager = nullptr;
	FontLibrary *old_font_library = TheFontLibrary;
	GameFont *normal_font = nullptr;
	GameFont *bold_font = nullptr;
	DisplayString *display_string = nullptr;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
		Render2DClass::Set_Screen_Resolution(RectClass(0.0f, 0.0f, 800.0f, 600.0f));

		asset_manager = WW3DAssetManager::Get_Instance();
		used_existing_asset_manager = asset_manager != nullptr;
		if (asset_manager == nullptr) {
			asset_manager = W3DNEW WW3DAssetManager();
			asset_manager_created = asset_manager != nullptr;
		}

		used_existing_font_library = TheFontLibrary != nullptr;
		if (TheFontLibrary == nullptr) {
			TheFontLibrary = NEW W3DFontLibrary;
			font_library_created = TheFontLibrary != nullptr;
			if (TheFontLibrary != nullptr) {
				TheFontLibrary->init();
			}
		}
	}

	if (asset_manager != nullptr && TheFontLibrary != nullptr) {
		normal_font = TheFontLibrary->getFont(AsciiString(font_face), point_size, FALSE);
		bold_font = TheFontLibrary->getFont(AsciiString(font_face), point_size, TRUE);
		normal_font_loaded = normal_font != nullptr && normal_font->fontData != nullptr;
		bold_font_loaded = bold_font != nullptr && bold_font->fontData != nullptr;
		normal_font_height = normal_font_loaded ? normal_font->height : 0;
		bold_font_height = bold_font_loaded ? bold_font->height : 0;
	}

	if (normal_font_loaded && bold_font_loaded) {
		display_string = newInstance(W3DDisplayString);
		display_string_allocated = display_string != nullptr;
	}

	if (display_string != nullptr) {
		display_string->setFont(normal_font);
		font_set = display_string->getFont() == normal_font;

		UnicodeString display_text;
		display_text.translate(AsciiString(text));
		display_string->setText(display_text);
		text_set = display_string->getText().compare(display_text) == 0;
		text_length = display_string->getTextLength();
		display_string->getSize(&display_width, &display_height);
		display_width_via_chars = display_string->getWidth();
		size_computed = display_width > 0 && display_height > 0 && display_width_via_chars > 0;

		begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			display_string->draw(draw_x, draw_y, text_color, drop_color, drop_x, drop_y);
			draw_called = true;
			end_render_result = WW3D::End_Render(false);
		}
	}

	if (display_string != nullptr) {
		display_string->deleteInstance();
		display_string = nullptr;
	}

	if (font_library_created && TheFontLibrary != nullptr) {
		TheFontLibrary->reset();
		delete TheFontLibrary;
		TheFontLibrary = old_font_library;
	} else {
		TheFontLibrary = old_font_library;
	}

	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}
	if (asset_manager_created && asset_manager != nullptr) {
		delete asset_manager;
		asset_manager = nullptr;
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		(asset_manager_created || used_existing_asset_manager) &&
		(font_library_created || used_existing_font_library) &&
		normal_font_loaded &&
		bold_font_loaded &&
		display_string_allocated &&
		font_set &&
		text_set &&
		text_length == 7 &&
		size_computed &&
		succeeded(begin_render_result) &&
		draw_called &&
		succeeded(end_render_result) &&
		state->copy_rects_calls >= 1 &&
		state->last_copy_rects_format == D3DFMT_A4R4G4B4 &&
		state->last_copy_rects_uploaded_texture_id != 0 &&
		state->browser_texture_create_calls >= 1 &&
		state->browser_texture_update_calls >= 1 &&
		state->browser_texture_bind_calls >= 1 &&
		state->create_vertex_buffer_calls >= 1 &&
		state->create_index_buffer_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_texture_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count >= 8 &&
		state->last_draw_primitive_count >= 4 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_bytes >= 8 * 44 &&
		state->last_draw_index_buffer_bytes >= 12 * 2 &&
		state->last_draw_index_format == D3DFMT_INDEX16 &&
		draw_state != nullptr &&
		draw_state->alpha_blend_enable == TRUE &&
		draw_state->src_blend == D3DBLEND_SRCALPHA &&
		draw_state->dest_blend == D3DBLEND_INVSRCALPHA &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_MODULATE &&
		stage0->values[D3DTSS_COLORARG1] == D3DTA_TEXTURE &&
		stage0->values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	char buffer[6200];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_display_string_probe\","
		"\"ok\":%s,"
		"\"text\":\"%s\","
		"\"font\":{\"face\":\"%s\",\"pointSize\":%d,"
		"\"normalLoaded\":%s,\"boldLoaded\":%s,"
		"\"normalHeight\":%d,\"boldHeight\":%d,"
		"\"fontLibraryCreated\":%s,\"usedExistingFontLibrary\":%s,"
		"\"assetManagerCreated\":%s,\"usedExistingAssetManager\":%s},"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
		"\"displayStringAllocated\":%s,\"fontSet\":%s,\"textSet\":%s,"
		"\"sizeComputed\":%s,\"beginRender\":%d,\"drawCalled\":%s,"
		"\"endRender\":%d},"
		"\"textMetrics\":{\"length\":%d,\"width\":%d,\"height\":%d,"
		"\"widthViaChars\":%d},"
		"\"drawRegion\":{\"left\":%d,\"top\":%d,\"right\":%d,\"bottom\":%d},"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"copyRects\":%u,\"browserTextureCreate\":%u,"
		"\"browserTextureUpdate\":%u,\"browserTextureBind\":%u,"
		"\"browserTextureRelease\":%u,\"createVertexBuffer\":%u,"
		"\"createIndexBuffer\":%u,\"browserBufferCreate\":%u,"
		"\"browserBufferUpdate\":%u,\"setTexture\":%u,"
		"\"setTextureStageState\":%u,\"setStreamSource\":%u,"
		"\"setIndices\":%u,\"drawIndexed\":%u},"
		"\"copyRects\":{\"rectCount\":%u,\"width\":%u,\"height\":%u,"
		"\"format\":%u,\"uploadedTextureId\":%u},"
		"\"texture\":{\"id\":%u,\"format\":%u,\"width\":%u,\"height\":%u,"
		"\"checksum\":%lu,\"lastBindStage\":%u,\"lastBindId\":%u},"
		"\"draw\":{\"primitiveType\":%d,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,\"vertexBufferId\":%u,"
		"\"indexBufferId\":%u,\"vertexBytes\":%u,\"indexBytes\":%u,"
		"\"indexFormat\":%d,\"renderState\":{\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,\"colorArg2\":%lu,"
		"\"alphaOp\":%lu,\"alphaArg1\":%lu,\"alphaArg2\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu}]}}}",
		bool_json(ok),
		text,
		font_face,
		point_size,
		bool_json(normal_font_loaded),
		bool_json(bold_font_loaded),
		normal_font_height,
		bold_font_height,
		bool_json(font_library_created),
		bool_json(used_existing_font_library),
		bool_json(asset_manager_created),
		bool_json(used_existing_asset_manager),
		init_result,
		set_device_result,
		bool_json(display_string_allocated),
		bool_json(font_set),
		bool_json(text_set),
		bool_json(size_computed),
		begin_render_result,
		bool_json(draw_called),
		end_render_result,
		text_length,
		display_width,
		display_height,
		display_width_via_chars,
		draw_x,
		draw_y,
		draw_x + display_width + drop_x,
		draw_y + display_height + drop_y,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->copy_rects_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->create_vertex_buffer_calls : 0,
		state != nullptr ? state->create_index_buffer_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->last_copy_rects_rect_count : 0,
		state != nullptr ? state->last_copy_rects_width : 0,
		state != nullptr ? state->last_copy_rects_height : 0,
		static_cast<unsigned int>(state != nullptr ? state->last_copy_rects_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_copy_rects_uploaded_texture_id : 0,
		state != nullptr ? state->last_copy_rects_uploaded_texture_id : 0,
		static_cast<unsigned int>(D3DFMT_A4R4G4B4),
		state != nullptr ? state->last_browser_texture_width : 0,
		state != nullptr ? state->last_browser_texture_height : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_browser_texture_checksum : 0),
		state != nullptr ? state->last_browser_texture_bind_stage : 0,
		state != nullptr ? state->last_browser_texture_bind_id : 0,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		state != nullptr ? state->last_draw_vertex_buffer_bytes : 0,
		state != nullptr ? state->last_draw_index_buffer_bytes : 0,
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->alpha_blend_enable) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->src_blend) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->dest_blend) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_COLOROP]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_COLORARG1]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_COLORARG2]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_ALPHAOP]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_ALPHAARG1]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_ALPHAARG2]) : 0,
		stage1 != nullptr ? static_cast<unsigned long>(stage1->values[D3DTSS_COLOROP]) : 0);

	g_ww3d_display_string_probe_json = buffer;
	return g_ww3d_display_string_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_game_text(
	const char *english_archive_path)
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	const char *label = "GUI:Command&ConquerGenerals";
	const char *csf_path = "Data\\English\\Generals.csf";
	const char *font_face = "Arial";
	constexpr int point_size = 26;
	constexpr int draw_x = 210;
	constexpr int draw_y = 260;
	constexpr int drop_x = 2;
	constexpr int drop_y = 2;
	const Color text_color = GameMakeColor(255, 255, 255, 255);
	const Color drop_color = GameMakeColor(48, 48, 48, 255);

	GameTextInterface *old_game_text = TheGameText;
	FontLibrary *old_font_library = TheFontLibrary;
	GameTextInterface *game_text = nullptr;
	GameFont *normal_font = nullptr;
	DisplayString *display_string = nullptr;
	UnicodeString fetched_text;
	AsciiString fetched_ascii;

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool runtime_asset_system_installed = false;
	bool csf_exists = false;
	bool game_text_created = false;
	bool game_text_initialized = false;
	bool fetched_label_exists = false;
	bool fetched_text_nonempty = false;
	bool used_existing_asset_manager = false;
	bool asset_manager_created = false;
	bool used_existing_font_library = false;
	bool font_library_created = false;
	bool normal_font_loaded = false;
	bool display_string_allocated = false;
	bool font_set = false;
	bool text_set = false;
	bool size_computed = false;
	bool draw_called = false;
	int text_length = 0;
	int normal_font_height = 0;
	int display_width = 0;
	int display_height = 0;
	int display_width_via_chars = 0;

	WW3DAssetManager *asset_manager = nullptr;
	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
		Render2DClass::Set_Screen_Resolution(RectClass(0.0f, 0.0f, 800.0f, 600.0f));

		runtime_asset_system_installed =
			wasm_browser_runtime_assets_install_archive_paths(english_archive_path, nullptr);
		csf_exists =
			runtime_asset_system_installed &&
			wasm_browser_runtime_assets_file_exists(csf_path);

		asset_manager = WW3DAssetManager::Get_Instance();
		used_existing_asset_manager = asset_manager != nullptr;
		if (asset_manager == nullptr) {
			asset_manager = W3DNEW WW3DAssetManager();
			asset_manager_created = asset_manager != nullptr;
		}

		used_existing_font_library = TheFontLibrary != nullptr;
		if (TheFontLibrary == nullptr) {
			TheFontLibrary = NEW W3DFontLibrary;
			font_library_created = TheFontLibrary != nullptr;
			if (TheFontLibrary != nullptr) {
				TheFontLibrary->init();
			}
		}
	}

	if (csf_exists) {
		game_text = CreateGameTextInterface();
		game_text_created = game_text != nullptr;
		TheGameText = game_text;
		if (game_text != nullptr) {
			game_text->init();
			game_text_initialized = true;
			fetched_text = game_text->fetch(label, &fetched_label_exists);
			fetched_text_nonempty = !fetched_text.isEmpty();
			fetched_ascii.translate(fetched_text);
		}
	}

	if (asset_manager != nullptr && TheFontLibrary != nullptr && fetched_label_exists) {
		normal_font = TheFontLibrary->getFont(AsciiString(font_face), point_size, FALSE);
		normal_font_loaded = normal_font != nullptr && normal_font->fontData != nullptr;
		normal_font_height = normal_font_loaded ? normal_font->height : 0;
	}

	if (normal_font_loaded) {
		display_string = newInstance(W3DDisplayString);
		display_string_allocated = display_string != nullptr;
	}

	if (display_string != nullptr) {
		display_string->setFont(normal_font);
		font_set = display_string->getFont() == normal_font;
		display_string->setText(fetched_text);
		text_set = display_string->getText().compare(fetched_text) == 0;
		text_length = display_string->getTextLength();
		display_string->getSize(&display_width, &display_height);
		display_width_via_chars = display_string->getWidth();
		size_computed = display_width > 0 && display_height > 0 && display_width_via_chars > 0;

		begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			display_string->draw(draw_x, draw_y, text_color, drop_color, drop_x, drop_y);
			draw_called = true;
			end_render_result = WW3D::End_Render(false);
		}
	}

	if (display_string != nullptr) {
		display_string->deleteInstance();
		display_string = nullptr;
	}
	TheGameText = old_game_text;
	delete game_text;

	if (font_library_created && TheFontLibrary != nullptr) {
		TheFontLibrary->reset();
		delete TheFontLibrary;
		TheFontLibrary = old_font_library;
	} else {
		TheFontLibrary = old_font_library;
	}

	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}
	if (asset_manager_created && asset_manager != nullptr) {
		delete asset_manager;
		asset_manager = nullptr;
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		runtime_asset_system_installed &&
		csf_exists &&
		game_text_created &&
		game_text_initialized &&
		fetched_label_exists &&
		fetched_text_nonempty &&
		(asset_manager_created || used_existing_asset_manager) &&
		(font_library_created || used_existing_font_library) &&
		normal_font_loaded &&
		display_string_allocated &&
		font_set &&
		text_set &&
		text_length > 0 &&
		size_computed &&
		succeeded(begin_render_result) &&
		draw_called &&
		succeeded(end_render_result) &&
		state->copy_rects_calls >= 1 &&
		state->last_copy_rects_format == D3DFMT_A4R4G4B4 &&
		state->last_copy_rects_uploaded_texture_id != 0 &&
		state->browser_texture_create_calls >= 1 &&
		state->browser_texture_update_calls >= 1 &&
		state->browser_texture_bind_calls >= 1 &&
		state->create_vertex_buffer_calls >= 1 &&
		state->create_index_buffer_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_texture_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count >= 8 &&
		state->last_draw_primitive_count >= 4 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_bytes >= 8 * 44 &&
		state->last_draw_index_buffer_bytes >= 12 * 2 &&
		state->last_draw_index_format == D3DFMT_INDEX16 &&
		draw_state != nullptr &&
		draw_state->alpha_blend_enable == TRUE &&
		draw_state->src_blend == D3DBLEND_SRCALPHA &&
		draw_state->dest_blend == D3DBLEND_INVSRCALPHA &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_MODULATE &&
		stage0->values[D3DTSS_COLORARG1] == D3DTA_TEXTURE &&
		stage0->values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	const std::string archive_json =
		json_escape(english_archive_path != nullptr ? english_archive_path : "");
	const std::string csf_path_json = json_escape(csf_path);
	const std::string label_json = json_escape(label);
	const std::string fetched_ascii_json =
		json_escape(fetched_ascii.str() != nullptr ? fetched_ascii.str() : "");
	const std::string runtime_assets_json = wasm_browser_runtime_assets_state_json();

	char buffer[7000];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_display_game_text_probe\","
		"\"ok\":%s,"
		"\"archives\":{\"english\":\"%s\"},"
		"\"gameText\":{\"csfPath\":\"%s\",\"label\":\"%s\","
		"\"created\":%s,\"initialized\":%s,\"labelExists\":%s,"
		"\"nonEmpty\":%s,\"ascii\":\"%s\"},"
		"\"font\":{\"face\":\"%s\",\"pointSize\":%d,"
		"\"normalLoaded\":%s,\"normalHeight\":%d,"
		"\"fontLibraryCreated\":%s,\"usedExistingFontLibrary\":%s,"
		"\"assetManagerCreated\":%s,\"usedExistingAssetManager\":%s},"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
		"\"runtimeAssetSystemInstalled\":%s,\"csfExists\":%s,"
		"\"displayStringAllocated\":%s,\"fontSet\":%s,\"textSet\":%s,"
		"\"sizeComputed\":%s,\"beginRender\":%d,\"drawCalled\":%s,"
		"\"endRender\":%d},"
		"\"textMetrics\":{\"length\":%d,\"width\":%d,\"height\":%d,"
		"\"widthViaChars\":%d},"
		"\"drawRegion\":{\"left\":%d,\"top\":%d,\"right\":%d,\"bottom\":%d},"
		"\"runtimeAssets\":%s,"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"copyRects\":%u,\"browserTextureCreate\":%u,"
		"\"browserTextureUpdate\":%u,\"browserTextureBind\":%u,"
		"\"browserTextureRelease\":%u,\"createVertexBuffer\":%u,"
		"\"createIndexBuffer\":%u,\"browserBufferCreate\":%u,"
		"\"browserBufferUpdate\":%u,\"setTexture\":%u,"
		"\"setTextureStageState\":%u,\"setStreamSource\":%u,"
		"\"setIndices\":%u,\"drawIndexed\":%u},"
		"\"copyRects\":{\"rectCount\":%u,\"width\":%u,\"height\":%u,"
		"\"format\":%u,\"uploadedTextureId\":%u},"
		"\"texture\":{\"id\":%u,\"format\":%u,\"width\":%u,\"height\":%u,"
		"\"checksum\":%lu,\"lastBindStage\":%u,\"lastBindId\":%u},"
		"\"draw\":{\"primitiveType\":%d,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,\"vertexBufferId\":%u,"
		"\"indexBufferId\":%u,\"vertexBytes\":%u,\"indexBytes\":%u,"
		"\"indexFormat\":%d,\"renderState\":{\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,\"colorArg2\":%lu,"
		"\"alphaOp\":%lu,\"alphaArg1\":%lu,\"alphaArg2\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu}]}}}",
		bool_json(ok),
		archive_json.c_str(),
		csf_path_json.c_str(),
		label_json.c_str(),
		bool_json(game_text_created),
		bool_json(game_text_initialized),
		bool_json(fetched_label_exists),
		bool_json(fetched_text_nonempty),
		fetched_ascii_json.c_str(),
		font_face,
		point_size,
		bool_json(normal_font_loaded),
		normal_font_height,
		bool_json(font_library_created),
		bool_json(used_existing_font_library),
		bool_json(asset_manager_created),
		bool_json(used_existing_asset_manager),
		init_result,
		set_device_result,
		bool_json(runtime_asset_system_installed),
		bool_json(csf_exists),
		bool_json(display_string_allocated),
		bool_json(font_set),
		bool_json(text_set),
		bool_json(size_computed),
		begin_render_result,
		bool_json(draw_called),
		end_render_result,
		text_length,
		display_width,
		display_height,
		display_width_via_chars,
		draw_x,
		draw_y,
		draw_x + display_width + drop_x,
		draw_y + display_height + drop_y,
		runtime_assets_json.c_str(),
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->copy_rects_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->create_vertex_buffer_calls : 0,
		state != nullptr ? state->create_index_buffer_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->copy_rects_calls : 0,
		state != nullptr ? state->last_copy_rects_width : 0,
		state != nullptr ? state->last_copy_rects_height : 0,
		state != nullptr ? static_cast<unsigned int>(state->last_copy_rects_format) : 0,
		state != nullptr ? state->last_copy_rects_uploaded_texture_id : 0,
		state != nullptr ? state->last_browser_texture_id : 0,
		state != nullptr ? static_cast<unsigned int>(state->last_browser_texture_format) : 0,
		state != nullptr ? state->last_browser_texture_width : 0,
		state != nullptr ? state->last_browser_texture_height : 0,
		state != nullptr ? static_cast<unsigned long>(state->last_browser_texture_checksum) : 0UL,
		state != nullptr ? state->last_set_texture_stage : 0,
		state != nullptr ? state->last_set_texture_id : 0,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		state != nullptr ? state->last_draw_vertex_buffer_bytes : 0,
		state != nullptr ? state->last_draw_index_buffer_bytes : 0,
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->alpha_blend_enable : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->src_blend : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->dest_blend : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAOP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG2] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_COLOROP] : 0));

	g_ww3d_display_game_text_probe_json = buffer;
	return g_ww3d_display_game_text_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_drawimage()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	constexpr unsigned int texture_width = 2;
	constexpr unsigned int texture_height = 2;
	GlobalData global_data;
	GlobalData *old_global_data = TheGlobalData;
	GlobalData *old_writable_global_data = TheWritableGlobalData;
	TheGlobalData = &global_data;
	TheWritableGlobalData = &global_data;

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	HRESULT texture_create_result = E_FAIL;
	HRESULT texture_lock_result = E_FAIL;
	HRESULT texture_unlock_result = E_FAIL;
	bool texture_created = false;
	bool display_allocated = false;
	bool display_setup = false;
	bool image_allocated = false;
	bool image_configured = false;
	bool image_raw_texture = false;
	UnsignedInt image_status = 0;
	float image_uv_lo_x = 0.0f;
	float image_uv_lo_y = 0.0f;
	float image_uv_hi_x = 0.0f;
	float image_uv_hi_y = 0.0f;
	Int image_width = 0;
	Int image_height = 0;
	bool drawimage_called = false;
	UINT texture_id = 0;

	TextureClass *texture = nullptr;
	ProbeW3DDisplayStorage display_storage;
	W3DDisplay *display = nullptr;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
		texture = NEW_REF(TextureClass, (
			texture_width,
			texture_height,
			WW3D_FORMAT_A8R8G8B8,
			MIP_LEVELS_1));
		texture_created = texture != nullptr && texture->Peek_D3D_Texture() != nullptr;
		texture_create_result = texture_created ? D3D_OK : E_FAIL;
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		texture_id = state != nullptr ? state->last_browser_texture_id : 0;
	}

	if (texture_created) {
		D3DLOCKED_RECT locked_rect = {};
		texture_lock_result = texture->Peek_D3D_Texture()->LockRect(0, &locked_rect, nullptr, 0);
		if (SUCCEEDED(texture_lock_result) && locked_rect.pBits != nullptr) {
			fill_argb_texture_red(locked_rect, texture_width, texture_height);
		}
		texture_unlock_result = texture->Peek_D3D_Texture()->UnlockRect(0);
	}

	if (texture_created && SUCCEEDED(texture_unlock_result)) {
		display = display_storage.prepare_for_2d_probe();
		display_allocated = display != nullptr;
		display_setup = display_allocated && display_storage.init_for_2d_probe(800, 600);

		Image *image = newInstance(Image);
		image_allocated = image != nullptr;
		if (image_allocated) {
			Region2D uv = {};
			uv.lo.x = 0.0f;
			uv.lo.y = 0.0f;
			uv.hi.x = 1.0f;
			uv.hi.y = 1.0f;
			ICoord2D image_size = {};
			image_size.x = 200;
			image_size.y = 160;
			image->setName(AsciiString("wasm-probe-display-drawimage"));
			image->setTextureWidth(texture_width);
			image->setTextureHeight(texture_height);
			image->setImageSize(&image_size);
			image->setUV(&uv);
			image->setRawTextureData(texture);
			image->setStatus(IMAGE_STATUS_RAW_TEXTURE);
			image_status = image->getStatus();
			image_raw_texture = BitTest(image_status, IMAGE_STATUS_RAW_TEXTURE);
			const Region2D *image_uv = image->getUV();
			image_uv_lo_x = image_uv->lo.x;
			image_uv_lo_y = image_uv->lo.y;
			image_uv_hi_x = image_uv->hi.x;
			image_uv_hi_y = image_uv->hi.y;
			image_width = image->getImageWidth();
			image_height = image->getImageHeight();
			image_configured =
				image->getRawTextureData() == texture &&
				image_raw_texture &&
				image_uv_lo_x == 0.0f &&
				image_uv_lo_y == 0.0f &&
				image_uv_hi_x == 1.0f &&
				image_uv_hi_y == 1.0f &&
				image_width == 200 &&
				image_height == 160;
		}

		if (display_setup && image_configured) {
			begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
			if (succeeded(begin_render_result)) {
				display->W3DDisplay::drawImage(image, 300, 220, 500, 380, 0xffffffffUL,
					Display::DRAW_IMAGE_ALPHA);
				drawimage_called = true;
				end_render_result = WW3D::End_Render(false);
			}
		}
		if (image != nullptr) {
			image->deleteInstance();
		}
	}

	display_storage.release_probe_renderer();
	REF_PTR_RELEASE(texture);

	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}

	TheWritableGlobalData = old_writable_global_data;
	TheGlobalData = old_global_data;

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		SUCCEEDED(texture_create_result) &&
		SUCCEEDED(texture_lock_result) &&
		SUCCEEDED(texture_unlock_result) &&
		texture_created &&
		display_allocated &&
		display_setup &&
		image_configured &&
		succeeded(begin_render_result) &&
		drawimage_called &&
		succeeded(end_render_result) &&
		texture_id != 0 &&
		state->create_device_calls >= 1 &&
		state->create_texture_calls >= 2 &&
		state->texture_lock_rect_calls >= 1 &&
		state->texture_unlock_rect_calls >= 1 &&
		state->browser_texture_create_calls >= 1 &&
		state->browser_texture_update_calls >= 1 &&
		state->browser_texture_bind_calls >= 2 &&
		state->browser_texture_release_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_texture_calls >= 2 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 4 &&
		state->last_draw_primitive_count == 2 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		(state->last_draw_transform_mask & 7u) == 7u &&
		draw_state != nullptr &&
		draw_state->alpha_blend_enable == TRUE &&
		draw_state->src_blend == D3DBLEND_SRCALPHA &&
		draw_state->dest_blend == D3DBLEND_INVSRCALPHA &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_MODULATE &&
		stage0->values[D3DTSS_COLORARG1] == D3DTA_TEXTURE &&
		stage0->values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	char buffer[5600];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_display_drawimage_probe\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,\"textureCreate\":%ld,"
		"\"textureLock\":%ld,\"textureUnlock\":%ld,\"textureCreated\":%s,"
		"\"displayAllocated\":%s,\"displaySetup\":%s,\"imageAllocated\":%s,"
		"\"imageConfigured\":%s,\"beginRender\":%d,\"drawImageCalled\":%s,"
		"\"endRender\":%d},"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"textureLockRect\":%u,\"textureUnlockRect\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"browserTextureRelease\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"browserBufferRelease\":%u,\"setTexture\":%u,"
		"\"setTextureStageState\":%u,\"setStreamSource\":%u,"
		"\"setIndices\":%u,\"drawIndexed\":%u,\"setTransform\":%u,"
		"\"clear\":%u,\"present\":%u},"
		"\"texture\":{\"id\":%u,\"format\":%u,\"width\":%u,\"height\":%u,"
		"\"expectedCenter\":[255,0,0,255],\"lastBindStage\":%u,"
		"\"lastBindId\":%u},"
		"\"image\":{\"rawTexture\":%s,\"status\":%u,\"uvLoX\":%.3f,"
		"\"uvLoY\":%.3f,\"uvHiX\":%.3f,\"uvHiY\":%.3f,"
		"\"width\":%d,\"height\":%d},"
		"\"draw\":{\"primitiveType\":%d,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"indexBufferId\":%u,"
		"\"indexFormat\":%d,\"transformMask\":%u,"
		"\"renderState\":{\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,\"colorArg2\":%lu,"
		"\"alphaOp\":%lu,\"alphaArg1\":%lu,\"alphaArg2\":%lu,"
		"\"texCoordIndex\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu,\"texCoordIndex\":%lu}]}}}",
		bool_json(ok),
		init_result,
		set_device_result,
		static_cast<long>(texture_create_result),
		static_cast<long>(texture_lock_result),
		static_cast<long>(texture_unlock_result),
		bool_json(texture_created),
		bool_json(display_allocated),
		bool_json(display_setup),
		bool_json(image_allocated),
		bool_json(image_configured),
		begin_render_result,
		bool_json(drawimage_called),
		end_render_result,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->texture_lock_rect_calls : 0,
		state != nullptr ? state->texture_unlock_rect_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		texture_id,
		static_cast<unsigned int>(D3DFMT_A8R8G8B8),
		texture_width,
		texture_height,
		state != nullptr ? state->last_browser_texture_bind_stage : 0,
		state != nullptr ? state->last_browser_texture_bind_id : 0,
		bool_json(image_raw_texture),
		static_cast<unsigned int>(image_status),
		static_cast<double>(image_uv_lo_x),
		static_cast<double>(image_uv_lo_y),
		static_cast<double>(image_uv_hi_x),
		static_cast<double>(image_uv_hi_y),
		image_width,
		image_height,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->alpha_blend_enable : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->src_blend : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->dest_blend : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAOP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_TEXCOORDINDEX] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_TEXCOORDINDEX] : 0));

	g_ww3d_display_drawimage_probe_json = buffer;
	return g_ww3d_display_drawimage_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_video_buffer()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	constexpr unsigned int video_width = 128;
	constexpr unsigned int video_height = 128;
	constexpr Int draw_left = 320;
	constexpr Int draw_top = 236;
	constexpr Int draw_right = 480;
	constexpr Int draw_bottom = 364;

	GlobalData global_data;
	GlobalData *old_global_data = TheGlobalData;
	GlobalData *old_writable_global_data = TheWritableGlobalData;
	TheGlobalData = &global_data;
	TheWritableGlobalData = &global_data;

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool display_allocated = false;
	bool display_setup = false;
	bool video_allocated = false;
	bool video_valid = false;
	bool video_locked = false;
	bool video_filled = false;
	bool draw_video_called = false;
	UINT texture_id = 0;
	UINT upload_checksum = 0;

	ProbeW3DDisplayStorage display_storage;
	W3DDisplay *display = nullptr;
	W3DVideoBuffer video_buffer(VideoBuffer::TYPE_X8R8G8B8);

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
		video_allocated = video_buffer.allocate(video_width, video_height);
		video_valid = video_buffer.valid();
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		texture_id = state != nullptr ? state->last_browser_texture_id : 0;
	}

	if (video_allocated && video_valid) {
		void *memory = video_buffer.lock();
		video_locked = memory != nullptr;
		if (video_locked) {
			fill_xrgb_video_buffer_red(memory, video_buffer.pitch(),
				video_buffer.textureWidth(), video_buffer.textureHeight());
			video_filled =
				video_buffer.width() == video_width &&
				video_buffer.height() == video_height &&
				video_buffer.textureWidth() == video_width &&
				video_buffer.textureHeight() == video_height &&
				video_buffer.pitch() == video_width * 4;
			video_buffer.unlock();
			const WasmD3D8ShimState *state = wasm_d3d8_get_state();
			upload_checksum = state != nullptr ? state->last_browser_texture_checksum : 0;
		}
	}

	if (video_filled) {
		display = display_storage.prepare_for_2d_probe();
		display_allocated = display != nullptr;
		display_setup = display_allocated && display_storage.init_for_2d_probe(800, 600);
		if (display_setup) {
			begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
			if (succeeded(begin_render_result)) {
				display->W3DDisplay::drawVideoBuffer(&video_buffer,
					draw_left, draw_top, draw_right, draw_bottom);
				draw_video_called = true;
				end_render_result = WW3D::End_Render(false);
			}
		}
	}

	display_storage.release_probe_renderer();
	video_buffer.free();

	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}

	TheWritableGlobalData = old_writable_global_data;
	TheGlobalData = old_global_data;

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		video_allocated &&
		video_valid &&
		video_locked &&
		video_filled &&
		display_allocated &&
		display_setup &&
		succeeded(begin_render_result) &&
		draw_video_called &&
		succeeded(end_render_result) &&
		texture_id != 0 &&
		upload_checksum != 0 &&
		state->browser_texture_create_calls >= 1 &&
		state->browser_texture_update_calls >= 2 &&
		state->browser_texture_bind_calls >= 1 &&
		state->browser_texture_release_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_texture_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 4 &&
		state->last_draw_primitive_count == 2 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		(state->last_draw_transform_mask & 7u) == 7u &&
		draw_state != nullptr &&
		draw_state->alpha_blend_enable == TRUE &&
		draw_state->src_blend == D3DBLEND_SRCALPHA &&
		draw_state->dest_blend == D3DBLEND_INVSRCALPHA &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_MODULATE &&
		stage0->values[D3DTSS_COLORARG1] == D3DTA_TEXTURE &&
		stage0->values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	char buffer[5600];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_display_video_buffer_probe\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
		"\"videoAllocated\":%s,\"videoValid\":%s,\"videoLocked\":%s,"
		"\"videoFilled\":%s,\"displayAllocated\":%s,\"displaySetup\":%s,"
		"\"beginRender\":%d,\"drawVideoBufferCalled\":%s,\"endRender\":%d},"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"textureLockRect\":%u,\"textureUnlockRect\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"browserTextureRelease\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"browserBufferRelease\":%u,\"setTexture\":%u,"
		"\"setTextureStageState\":%u,\"setStreamSource\":%u,"
		"\"setIndices\":%u,\"drawIndexed\":%u,\"setTransform\":%u,"
		"\"clear\":%u,\"present\":%u},"
		"\"videoBuffer\":{\"type\":%u,\"textureId\":%u,\"format\":%u,"
		"\"visibleWidth\":%u,\"visibleHeight\":%u,\"textureWidth\":%u,"
		"\"textureHeight\":%u,\"pitch\":%u,\"uploadChecksum\":%u,"
		"\"expectedCenter\":[255,0,0,255]},"
		"\"display\":{\"path\":\"W3DDisplay::drawVideoBuffer\","
		"\"drawLeft\":%d,\"drawTop\":%d,\"drawRight\":%d,\"drawBottom\":%d},"
		"\"draw\":{\"primitiveType\":%d,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"indexBufferId\":%u,"
		"\"indexFormat\":%d,\"transformMask\":%u,"
		"\"renderState\":{\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,\"colorArg2\":%lu,"
		"\"alphaOp\":%lu,\"alphaArg1\":%lu,\"alphaArg2\":%lu,"
		"\"texCoordIndex\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu,\"texCoordIndex\":%lu}]}}}",
		bool_json(ok),
		init_result,
		set_device_result,
		bool_json(video_allocated),
		bool_json(video_valid),
		bool_json(video_locked),
		bool_json(video_filled),
		bool_json(display_allocated),
		bool_json(display_setup),
		begin_render_result,
		bool_json(draw_video_called),
		end_render_result,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->texture_lock_rect_calls : 0,
		state != nullptr ? state->texture_unlock_rect_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		static_cast<unsigned int>(VideoBuffer::TYPE_X8R8G8B8),
		texture_id,
		static_cast<unsigned int>(D3DFMT_X8R8G8B8),
		video_width,
		video_height,
		video_width,
		video_height,
		video_width * 4,
		upload_checksum,
		draw_left,
		draw_top,
		draw_right,
		draw_bottom,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->alpha_blend_enable : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->src_blend : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->dest_blend : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAOP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_TEXCOORDINDEX] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_TEXCOORDINDEX] : 0));

	g_ww3d_display_video_buffer_probe_json = buffer;
	return g_ww3d_display_video_buffer_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_drawimage_additive()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	constexpr unsigned int texture_width = 2;
	constexpr unsigned int texture_height = 2;
	GlobalData global_data;
	GlobalData *old_global_data = TheGlobalData;
	GlobalData *old_writable_global_data = TheWritableGlobalData;
	TheGlobalData = &global_data;
	TheWritableGlobalData = &global_data;

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	HRESULT texture_create_result = E_FAIL;
	HRESULT texture_lock_result = E_FAIL;
	HRESULT texture_unlock_result = E_FAIL;
	bool texture_created = false;
	bool display_allocated = false;
	bool display_setup = false;
	bool image_allocated = false;
	bool image_configured = false;
	bool image_raw_texture = false;
	UnsignedInt image_status = 0;
	float image_uv_lo_x = 0.0f;
	float image_uv_lo_y = 0.0f;
	float image_uv_hi_x = 0.0f;
	float image_uv_hi_y = 0.0f;
	Int image_width = 0;
	Int image_height = 0;
	bool drawimage_called = false;
	UINT texture_id = 0;

	TextureClass *texture = nullptr;
	ProbeW3DDisplayStorage display_storage;
	W3DDisplay *display = nullptr;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
		texture = NEW_REF(TextureClass, (
			texture_width,
			texture_height,
			WW3D_FORMAT_A8R8G8B8,
			MIP_LEVELS_1));
		texture_created = texture != nullptr && texture->Peek_D3D_Texture() != nullptr;
		texture_create_result = texture_created ? D3D_OK : E_FAIL;
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		texture_id = state != nullptr ? state->last_browser_texture_id : 0;
	}

	if (texture_created) {
		D3DLOCKED_RECT locked_rect = {};
		texture_lock_result = texture->Peek_D3D_Texture()->LockRect(0, &locked_rect, nullptr, 0);
		if (SUCCEEDED(texture_lock_result) && locked_rect.pBits != nullptr) {
			fill_argb_texture_red(locked_rect, texture_width, texture_height);
		}
		texture_unlock_result = texture->Peek_D3D_Texture()->UnlockRect(0);
	}

	if (texture_created && SUCCEEDED(texture_unlock_result)) {
		display = display_storage.prepare_for_2d_probe();
		display_allocated = display != nullptr;
		display_setup = display_allocated && display_storage.init_for_2d_probe(800, 600);

		Image *image = newInstance(Image);
		image_allocated = image != nullptr;
		if (image_allocated) {
			Region2D uv = {};
			uv.lo.x = 0.0f;
			uv.lo.y = 0.0f;
			uv.hi.x = 1.0f;
			uv.hi.y = 1.0f;
			ICoord2D image_size = {};
			image_size.x = 200;
			image_size.y = 160;
			image->setName(AsciiString("wasm-probe-display-drawimage-additive"));
			image->setTextureWidth(texture_width);
			image->setTextureHeight(texture_height);
			image->setImageSize(&image_size);
			image->setUV(&uv);
			image->setRawTextureData(texture);
			image->setStatus(IMAGE_STATUS_RAW_TEXTURE);
			image_status = image->getStatus();
			image_raw_texture = BitTest(image_status, IMAGE_STATUS_RAW_TEXTURE);
			const Region2D *image_uv = image->getUV();
			image_uv_lo_x = image_uv->lo.x;
			image_uv_lo_y = image_uv->lo.y;
			image_uv_hi_x = image_uv->hi.x;
			image_uv_hi_y = image_uv->hi.y;
			image_width = image->getImageWidth();
			image_height = image->getImageHeight();
			image_configured =
				image->getRawTextureData() == texture &&
				image_raw_texture &&
				image_uv_lo_x == 0.0f &&
				image_uv_lo_y == 0.0f &&
				image_uv_hi_x == 1.0f &&
				image_uv_hi_y == 1.0f &&
				image_width == 200 &&
				image_height == 160;
		}

		if (display_setup && image_configured) {
			begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
			if (succeeded(begin_render_result)) {
				display->W3DDisplay::drawImage(image, 300, 220, 500, 380, 0xffffffffUL,
					Display::DRAW_IMAGE_ADDITIVE);
				drawimage_called = true;
				end_render_result = WW3D::End_Render(false);
			}
		}
		if (image != nullptr) {
			image->deleteInstance();
		}
	}

	display_storage.release_probe_renderer();
	REF_PTR_RELEASE(texture);

	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}

	TheWritableGlobalData = old_writable_global_data;
	TheGlobalData = old_global_data;

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		SUCCEEDED(texture_create_result) &&
		SUCCEEDED(texture_lock_result) &&
		SUCCEEDED(texture_unlock_result) &&
		texture_created &&
		display_allocated &&
		display_setup &&
		image_configured &&
		succeeded(begin_render_result) &&
		drawimage_called &&
		succeeded(end_render_result) &&
		texture_id != 0 &&
		state->create_device_calls >= 1 &&
		state->create_texture_calls >= 2 &&
		state->texture_lock_rect_calls >= 1 &&
		state->texture_unlock_rect_calls >= 1 &&
		state->browser_texture_create_calls >= 1 &&
		state->browser_texture_update_calls >= 1 &&
		state->browser_texture_bind_calls >= 2 &&
		state->browser_texture_release_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_texture_calls >= 2 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 4 &&
		state->last_draw_primitive_count == 2 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		(state->last_draw_transform_mask & 7u) == 7u &&
		draw_state != nullptr &&
		draw_state->alpha_blend_enable == TRUE &&
		draw_state->src_blend == D3DBLEND_ONE &&
		draw_state->dest_blend == D3DBLEND_ONE &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_MODULATE &&
		stage0->values[D3DTSS_COLORARG1] == D3DTA_TEXTURE &&
		stage0->values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	char buffer[5800];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_display_drawimage_additive_probe\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,\"textureCreate\":%ld,"
		"\"textureLock\":%ld,\"textureUnlock\":%ld,\"textureCreated\":%s,"
		"\"displayAllocated\":%s,\"displaySetup\":%s,\"imageAllocated\":%s,"
		"\"imageConfigured\":%s,\"beginRender\":%d,\"drawImageCalled\":%s,"
		"\"endRender\":%d},"
		"\"display\":{\"path\":\"W3DDisplay::drawImage\","
		"\"mode\":\"DRAW_IMAGE_ADDITIVE\"},"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"textureLockRect\":%u,\"textureUnlockRect\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"browserTextureRelease\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"browserBufferRelease\":%u,\"setTexture\":%u,"
		"\"setTextureStageState\":%u,\"setStreamSource\":%u,"
		"\"setIndices\":%u,\"drawIndexed\":%u,\"setTransform\":%u,"
		"\"clear\":%u,\"present\":%u},"
		"\"texture\":{\"id\":%u,\"format\":%u,\"width\":%u,\"height\":%u,"
		"\"expectedCenter\":[255,0,0,255],\"lastBindStage\":%u,"
		"\"lastBindId\":%u},"
		"\"image\":{\"rawTexture\":%s,\"status\":%u,\"uvLoX\":%.3f,"
		"\"uvLoY\":%.3f,\"uvHiX\":%.3f,\"uvHiY\":%.3f,"
		"\"width\":%d,\"height\":%d},"
		"\"draw\":{\"primitiveType\":%d,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"indexBufferId\":%u,"
		"\"indexFormat\":%d,\"transformMask\":%u,"
		"\"renderState\":{\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,\"colorArg2\":%lu,"
		"\"alphaOp\":%lu,\"alphaArg1\":%lu,\"alphaArg2\":%lu,"
		"\"texCoordIndex\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu,\"texCoordIndex\":%lu}]}}}",
		bool_json(ok),
		init_result,
		set_device_result,
		static_cast<long>(texture_create_result),
		static_cast<long>(texture_lock_result),
		static_cast<long>(texture_unlock_result),
		bool_json(texture_created),
		bool_json(display_allocated),
		bool_json(display_setup),
		bool_json(image_allocated),
		bool_json(image_configured),
		begin_render_result,
		bool_json(drawimage_called),
		end_render_result,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->texture_lock_rect_calls : 0,
		state != nullptr ? state->texture_unlock_rect_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		texture_id,
		static_cast<unsigned int>(D3DFMT_A8R8G8B8),
		texture_width,
		texture_height,
		state != nullptr ? state->last_browser_texture_bind_stage : 0,
		state != nullptr ? state->last_browser_texture_bind_id : 0,
		bool_json(image_raw_texture),
		static_cast<unsigned int>(image_status),
		static_cast<double>(image_uv_lo_x),
		static_cast<double>(image_uv_lo_y),
		static_cast<double>(image_uv_hi_x),
		static_cast<double>(image_uv_hi_y),
		image_width,
		image_height,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->alpha_blend_enable : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->src_blend : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->dest_blend : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAOP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_TEXCOORDINDEX] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_TEXCOORDINDEX] : 0));

	g_ww3d_display_drawimage_additive_probe_json = buffer;
	return g_ww3d_display_drawimage_additive_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_drawimage_solid()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	constexpr unsigned int texture_width = 2;
	constexpr unsigned int texture_height = 2;
	GlobalData global_data;
	GlobalData *old_global_data = TheGlobalData;
	GlobalData *old_writable_global_data = TheWritableGlobalData;
	TheGlobalData = &global_data;
	TheWritableGlobalData = &global_data;

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	HRESULT texture_create_result = E_FAIL;
	HRESULT texture_lock_result = E_FAIL;
	HRESULT texture_unlock_result = E_FAIL;
	bool texture_created = false;
	bool display_allocated = false;
	bool display_setup = false;
	bool image_allocated = false;
	bool image_configured = false;
	bool image_raw_texture = false;
	UnsignedInt image_status = 0;
	float image_uv_lo_x = 0.0f;
	float image_uv_lo_y = 0.0f;
	float image_uv_hi_x = 0.0f;
	float image_uv_hi_y = 0.0f;
	Int image_width = 0;
	Int image_height = 0;
	bool drawimage_called = false;
	UINT texture_id = 0;

	TextureClass *texture = nullptr;
	ProbeW3DDisplayStorage display_storage;
	W3DDisplay *display = nullptr;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
		texture = NEW_REF(TextureClass, (
			texture_width,
			texture_height,
			WW3D_FORMAT_A8R8G8B8,
			MIP_LEVELS_1));
		texture_created = texture != nullptr && texture->Peek_D3D_Texture() != nullptr;
		texture_create_result = texture_created ? D3D_OK : E_FAIL;
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		texture_id = state != nullptr ? state->last_browser_texture_id : 0;
	}

	if (texture_created) {
		D3DLOCKED_RECT locked_rect = {};
		texture_lock_result = texture->Peek_D3D_Texture()->LockRect(0, &locked_rect, nullptr, 0);
		if (SUCCEEDED(texture_lock_result) && locked_rect.pBits != nullptr) {
			fill_argb_texture_translucent_red(locked_rect, texture_width, texture_height);
		}
		texture_unlock_result = texture->Peek_D3D_Texture()->UnlockRect(0);
	}

	if (texture_created && SUCCEEDED(texture_unlock_result)) {
		display = display_storage.prepare_for_2d_probe();
		display_allocated = display != nullptr;
		display_setup = display_allocated && display_storage.init_for_2d_probe(800, 600);

		Image *image = newInstance(Image);
		image_allocated = image != nullptr;
		if (image_allocated) {
			Region2D uv = {};
			uv.lo.x = 0.0f;
			uv.lo.y = 0.0f;
			uv.hi.x = 1.0f;
			uv.hi.y = 1.0f;
			ICoord2D image_size = {};
			image_size.x = 200;
			image_size.y = 160;
			image->setName(AsciiString("wasm-probe-display-drawimage-solid"));
			image->setTextureWidth(texture_width);
			image->setTextureHeight(texture_height);
			image->setImageSize(&image_size);
			image->setUV(&uv);
			image->setRawTextureData(texture);
			image->setStatus(IMAGE_STATUS_RAW_TEXTURE);
			image_status = image->getStatus();
			image_raw_texture = BitTest(image_status, IMAGE_STATUS_RAW_TEXTURE);
			const Region2D *image_uv = image->getUV();
			image_uv_lo_x = image_uv->lo.x;
			image_uv_lo_y = image_uv->lo.y;
			image_uv_hi_x = image_uv->hi.x;
			image_uv_hi_y = image_uv->hi.y;
			image_width = image->getImageWidth();
			image_height = image->getImageHeight();
			image_configured =
				image->getRawTextureData() == texture &&
				image_raw_texture &&
				image_uv_lo_x == 0.0f &&
				image_uv_lo_y == 0.0f &&
				image_uv_hi_x == 1.0f &&
				image_uv_hi_y == 1.0f &&
				image_width == 200 &&
				image_height == 160;
		}

		if (display_setup && image_configured) {
			begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
			if (succeeded(begin_render_result)) {
				display->W3DDisplay::drawImage(image, 300, 220, 500, 380, 0xffffffffUL,
					Display::DRAW_IMAGE_SOLID);
				drawimage_called = true;
				end_render_result = WW3D::End_Render(false);
			}
		}
		if (image != nullptr) {
			image->deleteInstance();
		}
	}

	display_storage.release_probe_renderer();
	REF_PTR_RELEASE(texture);

	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}

	TheWritableGlobalData = old_writable_global_data;
	TheGlobalData = old_global_data;

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		SUCCEEDED(texture_create_result) &&
		SUCCEEDED(texture_lock_result) &&
		SUCCEEDED(texture_unlock_result) &&
		texture_created &&
		display_allocated &&
		display_setup &&
		image_configured &&
		succeeded(begin_render_result) &&
		drawimage_called &&
		succeeded(end_render_result) &&
		texture_id != 0 &&
		state->create_device_calls >= 1 &&
		state->create_texture_calls >= 2 &&
		state->texture_lock_rect_calls >= 1 &&
		state->texture_unlock_rect_calls >= 1 &&
		state->browser_texture_create_calls >= 1 &&
		state->browser_texture_update_calls >= 1 &&
		state->browser_texture_bind_calls >= 2 &&
		state->browser_texture_release_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_texture_calls >= 2 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 4 &&
		state->last_draw_primitive_count == 2 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		(state->last_draw_transform_mask & 7u) == 7u &&
		draw_state != nullptr &&
		draw_state->alpha_blend_enable == FALSE &&
		draw_state->src_blend == D3DBLEND_ONE &&
		draw_state->dest_blend == D3DBLEND_ZERO &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_MODULATE &&
		stage0->values[D3DTSS_COLORARG1] == D3DTA_TEXTURE &&
		stage0->values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	char buffer[5900];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_display_drawimage_solid_probe\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,\"textureCreate\":%ld,"
		"\"textureLock\":%ld,\"textureUnlock\":%ld,\"textureCreated\":%s,"
		"\"displayAllocated\":%s,\"displaySetup\":%s,\"imageAllocated\":%s,"
		"\"imageConfigured\":%s,\"beginRender\":%d,\"drawImageCalled\":%s,"
		"\"endRender\":%d},"
		"\"display\":{\"path\":\"W3DDisplay::drawImage\","
		"\"mode\":\"DRAW_IMAGE_SOLID\"},"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"textureLockRect\":%u,\"textureUnlockRect\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"browserTextureRelease\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"browserBufferRelease\":%u,\"setTexture\":%u,"
		"\"setTextureStageState\":%u,\"setStreamSource\":%u,"
		"\"setIndices\":%u,\"drawIndexed\":%u,\"setTransform\":%u,"
		"\"clear\":%u,\"present\":%u},"
		"\"texture\":{\"id\":%u,\"format\":%u,\"width\":%u,\"height\":%u,"
		"\"expectedSource\":[255,0,0,64],\"lastBindStage\":%u,"
		"\"lastBindId\":%u},"
		"\"image\":{\"rawTexture\":%s,\"status\":%u,\"uvLoX\":%.3f,"
		"\"uvLoY\":%.3f,\"uvHiX\":%.3f,\"uvHiY\":%.3f,"
		"\"width\":%d,\"height\":%d},"
		"\"draw\":{\"primitiveType\":%d,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"indexBufferId\":%u,"
		"\"indexFormat\":%d,\"transformMask\":%u,"
		"\"renderState\":{\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,\"colorArg2\":%lu,"
		"\"alphaOp\":%lu,\"alphaArg1\":%lu,\"alphaArg2\":%lu,"
		"\"texCoordIndex\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu,\"texCoordIndex\":%lu}]}}}",
		bool_json(ok),
		init_result,
		set_device_result,
		static_cast<long>(texture_create_result),
		static_cast<long>(texture_lock_result),
		static_cast<long>(texture_unlock_result),
		bool_json(texture_created),
		bool_json(display_allocated),
		bool_json(display_setup),
		bool_json(image_allocated),
		bool_json(image_configured),
		begin_render_result,
		bool_json(drawimage_called),
		end_render_result,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->texture_lock_rect_calls : 0,
		state != nullptr ? state->texture_unlock_rect_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		texture_id,
		static_cast<unsigned int>(D3DFMT_A8R8G8B8),
		texture_width,
		texture_height,
		state != nullptr ? state->last_browser_texture_bind_stage : 0,
		state != nullptr ? state->last_browser_texture_bind_id : 0,
		bool_json(image_raw_texture),
		static_cast<unsigned int>(image_status),
		static_cast<double>(image_uv_lo_x),
		static_cast<double>(image_uv_lo_y),
		static_cast<double>(image_uv_hi_x),
		static_cast<double>(image_uv_hi_y),
		image_width,
		image_height,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->alpha_blend_enable : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->src_blend : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->dest_blend : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAOP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_TEXCOORDINDEX] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_TEXCOORDINDEX] : 0));

	g_ww3d_display_drawimage_solid_probe_json = buffer;
	return g_ww3d_display_drawimage_solid_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_drawimage_grayscale()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	constexpr unsigned int texture_width = 2;
	constexpr unsigned int texture_height = 2;
	GlobalData global_data;
	GlobalData *old_global_data = TheGlobalData;
	GlobalData *old_writable_global_data = TheWritableGlobalData;
	TheGlobalData = &global_data;
	TheWritableGlobalData = &global_data;

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	HRESULT texture_create_result = E_FAIL;
	HRESULT texture_lock_result = E_FAIL;
	HRESULT texture_unlock_result = E_FAIL;
	bool texture_created = false;
	bool display_allocated = false;
	bool display_setup = false;
	bool image_allocated = false;
	bool image_configured = false;
	bool image_raw_texture = false;
	UnsignedInt image_status = 0;
	float image_uv_lo_x = 0.0f;
	float image_uv_lo_y = 0.0f;
	float image_uv_hi_x = 0.0f;
	float image_uv_hi_y = 0.0f;
	Int image_width = 0;
	Int image_height = 0;
	bool drawimage_called = false;
	UINT texture_id = 0;

	TextureClass *texture = nullptr;
	ProbeW3DDisplayStorage display_storage;
	W3DDisplay *display = nullptr;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
		texture = NEW_REF(TextureClass, (
			texture_width,
			texture_height,
			WW3D_FORMAT_A8R8G8B8,
			MIP_LEVELS_1));
		texture_created = texture != nullptr && texture->Peek_D3D_Texture() != nullptr;
		texture_create_result = texture_created ? D3D_OK : E_FAIL;
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		texture_id = state != nullptr ? state->last_browser_texture_id : 0;
	}

	if (texture_created) {
		D3DLOCKED_RECT locked_rect = {};
		texture_lock_result = texture->Peek_D3D_Texture()->LockRect(0, &locked_rect, nullptr, 0);
		if (SUCCEEDED(texture_lock_result) && locked_rect.pBits != nullptr) {
			fill_argb_texture_grayscale_probe(locked_rect, texture_width, texture_height);
		}
		texture_unlock_result = texture->Peek_D3D_Texture()->UnlockRect(0);
	}

	if (texture_created && SUCCEEDED(texture_unlock_result)) {
		display = display_storage.prepare_for_2d_probe();
		display_allocated = display != nullptr;
		display_setup = display_allocated && display_storage.init_for_2d_probe(800, 600);

		Image *image = newInstance(Image);
		image_allocated = image != nullptr;
		if (image_allocated) {
			Region2D uv = {};
			uv.lo.x = 0.0f;
			uv.lo.y = 0.0f;
			uv.hi.x = 1.0f;
			uv.hi.y = 1.0f;
			ICoord2D image_size = {};
			image_size.x = 200;
			image_size.y = 160;
			image->setName(AsciiString("wasm-probe-display-drawimage-grayscale"));
			image->setTextureWidth(texture_width);
			image->setTextureHeight(texture_height);
			image->setImageSize(&image_size);
			image->setUV(&uv);
			image->setRawTextureData(texture);
			image->setStatus(IMAGE_STATUS_RAW_TEXTURE);
			image_status = image->getStatus();
			image_raw_texture = BitTest(image_status, IMAGE_STATUS_RAW_TEXTURE);
			const Region2D *image_uv = image->getUV();
			image_uv_lo_x = image_uv->lo.x;
			image_uv_lo_y = image_uv->lo.y;
			image_uv_hi_x = image_uv->hi.x;
			image_uv_hi_y = image_uv->hi.y;
			image_width = image->getImageWidth();
			image_height = image->getImageHeight();
			image_configured =
				image->getRawTextureData() == texture &&
				image_raw_texture &&
				image_uv_lo_x == 0.0f &&
				image_uv_lo_y == 0.0f &&
				image_uv_hi_x == 1.0f &&
				image_uv_hi_y == 1.0f &&
				image_width == 200 &&
				image_height == 160;
		}

		if (display_setup && image_configured) {
			begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
			if (succeeded(begin_render_result)) {
				display->W3DDisplay::drawImage(image, 300, 220, 500, 380, 0xffffffffUL,
					Display::DRAW_IMAGE_GRAYSCALE);
				drawimage_called = true;
				end_render_result = WW3D::End_Render(false);
			}
		}
		if (image != nullptr) {
			image->deleteInstance();
		}
	}

	display_storage.release_probe_renderer();
	REF_PTR_RELEASE(texture);

	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}

	TheWritableGlobalData = old_writable_global_data;
	TheGlobalData = old_global_data;

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;
	const DWORD grayscale_factor = 0x80a5ca8eUL;
	const DWORD grayscale_alpha_factor = D3DTA_TFACTOR | D3DTA_ALPHAREPLICATE;
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		SUCCEEDED(texture_create_result) &&
		SUCCEEDED(texture_lock_result) &&
		SUCCEEDED(texture_unlock_result) &&
		texture_created &&
		display_allocated &&
		display_setup &&
		image_configured &&
		succeeded(begin_render_result) &&
		drawimage_called &&
		succeeded(end_render_result) &&
		texture_id != 0 &&
		state->create_device_calls >= 1 &&
		state->create_texture_calls >= 2 &&
		state->texture_lock_rect_calls >= 1 &&
		state->texture_unlock_rect_calls >= 1 &&
		state->browser_texture_create_calls >= 1 &&
		state->browser_texture_update_calls >= 1 &&
		state->browser_texture_bind_calls >= 2 &&
		state->browser_texture_release_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_texture_calls >= 2 &&
		state->set_texture_stage_state_calls >= 7 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 4 &&
		state->last_draw_primitive_count == 2 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		(state->last_draw_transform_mask & 7u) == 7u &&
		draw_state != nullptr &&
		draw_state->alpha_blend_enable == FALSE &&
		draw_state->src_blend == D3DBLEND_ONE &&
		draw_state->dest_blend == D3DBLEND_ZERO &&
		draw_state->texture_factor == grayscale_factor &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_MULTIPLYADD &&
		stage0->values[D3DTSS_COLORARG0] == grayscale_alpha_factor &&
		stage0->values[D3DTSS_COLORARG1] == D3DTA_TEXTURE &&
		stage0->values[D3DTSS_COLORARG2] == grayscale_alpha_factor &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DOTPRODUCT3 &&
		stage1->values[D3DTSS_COLORARG1] == D3DTA_CURRENT &&
		stage1->values[D3DTSS_COLORARG2] == D3DTA_TFACTOR;

	char buffer[6800];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_display_drawimage_grayscale_probe\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,\"textureCreate\":%ld,"
		"\"textureLock\":%ld,\"textureUnlock\":%ld,\"textureCreated\":%s,"
		"\"displayAllocated\":%s,\"displaySetup\":%s,\"imageAllocated\":%s,"
		"\"imageConfigured\":%s,\"beginRender\":%d,\"drawImageCalled\":%s,"
		"\"endRender\":%d},"
		"\"display\":{\"path\":\"W3DDisplay::drawImage\","
		"\"mode\":\"DRAW_IMAGE_GRAYSCALE\"},"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"textureLockRect\":%u,\"textureUnlockRect\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"browserTextureRelease\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"browserBufferRelease\":%u,\"setTexture\":%u,"
		"\"setTextureStageState\":%u,\"setStreamSource\":%u,"
		"\"setIndices\":%u,\"drawIndexed\":%u,\"setTransform\":%u,"
		"\"clear\":%u,\"present\":%u},"
		"\"texture\":{\"id\":%u,\"format\":%u,\"width\":%u,\"height\":%u,"
		"\"expectedSource\":[64,128,192,255],"
		"\"expectedCenter\":[117,117,117,255],\"lastBindStage\":%u,"
		"\"lastBindId\":%u},"
		"\"image\":{\"rawTexture\":%s,\"status\":%u,\"uvLoX\":%.3f,"
		"\"uvLoY\":%.3f,\"uvHiX\":%.3f,\"uvHiY\":%.3f,"
		"\"width\":%d,\"height\":%d},"
		"\"draw\":{\"primitiveType\":%d,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"indexBufferId\":%u,"
		"\"indexFormat\":%d,\"transformMask\":%u,"
		"\"renderState\":{\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"textureFactor\":%lu,"
		"\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg0\":%lu,"
		"\"colorArg1\":%lu,\"colorArg2\":%lu,"
		"\"alphaOp\":%lu,\"alphaArg0\":%lu,\"alphaArg1\":%lu,"
		"\"alphaArg2\":%lu,\"texCoordIndex\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu,\"colorArg0\":%lu,"
		"\"colorArg1\":%lu,\"colorArg2\":%lu,\"alphaOp\":%lu,"
		"\"texCoordIndex\":%lu}]}}}",
		bool_json(ok),
		init_result,
		set_device_result,
		static_cast<long>(texture_create_result),
		static_cast<long>(texture_lock_result),
		static_cast<long>(texture_unlock_result),
		bool_json(texture_created),
		bool_json(display_allocated),
		bool_json(display_setup),
		bool_json(image_allocated),
		bool_json(image_configured),
		begin_render_result,
		bool_json(drawimage_called),
		end_render_result,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->texture_lock_rect_calls : 0,
		state != nullptr ? state->texture_unlock_rect_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		texture_id,
		static_cast<unsigned int>(D3DFMT_A8R8G8B8),
		texture_width,
		texture_height,
		state != nullptr ? state->last_browser_texture_bind_stage : 0,
		state != nullptr ? state->last_browser_texture_bind_id : 0,
		bool_json(image_raw_texture),
		static_cast<unsigned int>(image_status),
		static_cast<double>(image_uv_lo_x),
		static_cast<double>(image_uv_lo_y),
		static_cast<double>(image_uv_hi_x),
		static_cast<double>(image_uv_hi_y),
		image_width,
		image_height,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->alpha_blend_enable : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->src_blend : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->dest_blend : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->texture_factor : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG0] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAOP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG0] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_TEXCOORDINDEX] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_COLORARG0] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_COLORARG1] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_COLORARG2] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_ALPHAOP] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_TEXCOORDINDEX] : 0));

	g_ww3d_display_drawimage_grayscale_probe_json = buffer;
	return g_ww3d_display_drawimage_grayscale_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_drawimage_file(
	const char *texture_archive_path)
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	GlobalData *probe_global_data = nullptr;
	GlobalData *old_global_data = nullptr;
	GlobalData *old_writable_global_data = nullptr;
	bool global_data_installed = false;

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool used_existing_asset_manager = false;
	bool asset_manager_created = false;
	bool runtime_asset_system_installed = false;
	bool texture_archive_loaded = false;
	bool texture_file_exists = false;
	bool texture_file_factory_installed = false;
	bool texture_dds_available = false;
	bool texture_preloaded = false;
	bool texture_registered = false;
	bool texture_resolved = false;
	bool texture_dds_loaded = false;
	bool texture_has_d3d_surface = false;
	bool display_allocated = false;
	bool display_setup = false;
	bool image_allocated = false;
	bool image_configured = false;
	bool image_raw_texture = false;
	bool drawimage_called = false;
	UnsignedInt image_status = 0;
	float image_uv_lo_x = 0.0f;
	float image_uv_lo_y = 0.0f;
	float image_uv_hi_x = 0.0f;
	float image_uv_hi_y = 0.0f;
	Int image_width = 0;
	Int image_height = 0;
	HRESULT texture_level_desc_result = E_FAIL;
	UINT texture_id = 0;
	UINT texture_width = 0;
	UINT texture_height = 0;
	UINT texture_levels = 0;
	UINT texture_uploaded_levels = 0;
	DWORD texture_format = D3DFMT_UNKNOWN;
	DWORD texture_upload_format = D3DFMT_UNKNOWN;
	UINT texture_upload_width = 0;
	UINT texture_upload_height = 0;
	UINT texture_upload_bytes = 0;
	DWORD texture_upload_checksum = 0;
	std::string image_filename;
	std::string loaded_texture_name;

	WW3DAssetManager *asset_manager = nullptr;
	Image *image = nullptr;
	ProbeW3DDisplayStorage display_storage;
	W3DDisplay *display = nullptr;

	if (succeeded(init_result)) {
		asset_manager = WW3DAssetManager::Get_Instance();
		used_existing_asset_manager = asset_manager != nullptr;
		if (asset_manager == nullptr) {
			asset_manager = W3DNEW WW3DAssetManager();
			asset_manager_created = asset_manager != nullptr;
		}
	}

	if (asset_manager != nullptr) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);

		runtime_asset_system_installed =
			wasm_browser_runtime_assets_install_archive_paths(texture_archive_path, nullptr);
		const WasmBrowserRuntimeAssetsState &runtime_assets = wasm_browser_runtime_assets_state();
		texture_file_factory_installed = runtime_assets.w3d_file_system_installed;
		texture_file_exists =
			runtime_asset_system_installed &&
			wasm_browser_runtime_assets_file_exists(kDisplayDrawImageFileTextureArchiveEntry);
		texture_archive_loaded = texture_file_exists;
		if (texture_file_exists) {
			DDSFileClass dds_file(kDisplayDrawImageFileTextureName, 0);
			texture_dds_available = dds_file.Is_Available();
		}
	}

	if (asset_manager != nullptr && texture_dds_available) {
		TextureClass *preloaded_texture =
			asset_manager->Get_Texture(kDisplayDrawImageFileTextureName, MIP_LEVELS_1);
		if (preloaded_texture != nullptr) {
			texture_registered =
				asset_manager->Texture_Hash().Get(kDisplayDrawImageFileTextureName) == preloaded_texture;
			preloaded_texture->Init();
			texture_preloaded = preloaded_texture->Is_Initialized();
			preloaded_texture->Release_Ref();
		}
	}

	if (asset_manager != nullptr && texture_dds_available) {
		probe_global_data = new GlobalData;
		old_global_data = TheGlobalData;
		old_writable_global_data = TheWritableGlobalData;
		TheGlobalData = probe_global_data;
		TheWritableGlobalData = probe_global_data;
		global_data_installed = true;
		display = display_storage.prepare_for_2d_probe();
		display_allocated = display != nullptr;
		display_setup = display_allocated && display_storage.init_for_2d_probe(800, 600);

		image = newInstance(Image);
		image_allocated = image != nullptr;
		if (image_allocated) {
			Region2D uv = {};
			uv.lo.x = 0.0f;
			uv.lo.y = 0.0f;
			uv.hi.x = 1.0f;
			uv.hi.y = 1.0f;
			ICoord2D image_size = {};
			image_size.x = 200;
			image_size.y = 160;
			image->setName(AsciiString("wasm-probe-display-drawimage-file"));
			image->setFilename(AsciiString(kDisplayDrawImageFileTextureName));
			image->setTextureWidth(64);
			image->setTextureHeight(64);
			image->setImageSize(&image_size);
			image->setUV(&uv);
			image_status = image->getStatus();
			image_raw_texture = BitTest(image_status, IMAGE_STATUS_RAW_TEXTURE);
			image_filename = image->getFilename().str() != nullptr ? image->getFilename().str() : "";
			const Region2D *image_uv = image->getUV();
			image_uv_lo_x = image_uv->lo.x;
			image_uv_lo_y = image_uv->lo.y;
			image_uv_hi_x = image_uv->hi.x;
			image_uv_hi_y = image_uv->hi.y;
			image_width = image->getImageWidth();
			image_height = image->getImageHeight();
			image_configured =
				image->getRawTextureData() == nullptr &&
				!image_raw_texture &&
				image_filename == kDisplayDrawImageFileTextureName &&
				image_uv_lo_x == 0.0f &&
				image_uv_lo_y == 0.0f &&
				image_uv_hi_x == 1.0f &&
				image_uv_hi_y == 1.0f &&
				image_width == 200 &&
				image_height == 160;
		}
	}

	if (display_setup && image_configured) {
		begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			display->W3DDisplay::drawImage(image, 300, 220, 500, 380, 0xffffffffUL,
				Display::DRAW_IMAGE_ALPHA);
			drawimage_called = true;
			const WasmD3D8ShimState *render_state = wasm_d3d8_get_state();
			texture_id = render_state != nullptr ? render_state->last_set_texture_id : 0;
			end_render_result = WW3D::End_Render(false);
		}
	}

	TextureClass *loaded_texture =
		display_storage.render != nullptr ? display_storage.render->Peek_Texture() : nullptr;
	if (loaded_texture != nullptr) {
		texture_resolved = true;
		if (loaded_texture->Get_Texture_Name() != nullptr) {
			loaded_texture_name = loaded_texture->Get_Texture_Name();
		}
		texture_registered =
			asset_manager != nullptr &&
			asset_manager->Texture_Hash().Get(kDisplayDrawImageFileTextureName) == loaded_texture;
		texture_dds_loaded = loaded_texture->Is_Initialized();
		IDirect3DTexture8 *d3d_texture = loaded_texture->Peek_D3D_Texture();
		texture_has_d3d_surface = d3d_texture != nullptr;
		if (d3d_texture != nullptr) {
			texture_uploaded_levels = d3d_texture->GetLevelCount();
			texture_levels = texture_uploaded_levels;
			D3DSURFACE_DESC texture_desc = {};
			texture_level_desc_result = d3d_texture->GetLevelDesc(0, &texture_desc);
			if (SUCCEEDED(texture_level_desc_result)) {
				texture_width = texture_desc.Width;
				texture_height = texture_desc.Height;
				texture_format = texture_desc.Format;
				texture_upload_format = texture_desc.Format;
				texture_upload_width = texture_desc.Width;
				texture_upload_height = texture_desc.Height;
			}
		}
	}

	if (image != nullptr) {
		image->deleteInstance();
		image = nullptr;
	}

	display_storage.release_probe_renderer();

	if (asset_manager_created && asset_manager != nullptr) {
		delete asset_manager;
		asset_manager = nullptr;
	}

	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}

	if (global_data_installed) {
		TheWritableGlobalData = old_writable_global_data;
		TheGlobalData = old_global_data;
	}
	delete probe_global_data;

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	if (state != nullptr) {
		if (texture_id == 0) {
			texture_id = state->last_set_texture_id;
		}
		texture_upload_bytes = state->last_browser_texture_bytes;
		texture_upload_checksum = state->last_browser_texture_checksum;
	}
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		(asset_manager_created || used_existing_asset_manager) &&
		runtime_asset_system_installed &&
		texture_archive_loaded &&
		texture_file_exists &&
		texture_file_factory_installed &&
		texture_dds_available &&
		texture_preloaded &&
		texture_registered &&
		texture_resolved &&
		texture_dds_loaded &&
		texture_has_d3d_surface &&
		display_allocated &&
		display_setup &&
		image_configured &&
		!image_raw_texture &&
		image_status == IMAGE_STATUS_NONE &&
		succeeded(begin_render_result) &&
		drawimage_called &&
		succeeded(end_render_result) &&
		loaded_texture_name == kDisplayDrawImageFileTextureName &&
		texture_id != 0 &&
		(texture_format == D3DFMT_DXT1 ||
			texture_format == D3DFMT_DXT3 ||
			texture_format == D3DFMT_DXT5) &&
		texture_width > 0 &&
		texture_height > 0 &&
		texture_levels > 0 &&
		texture_uploaded_levels == texture_levels &&
		state->create_device_calls >= 1 &&
		state->create_texture_calls >= 1 &&
		state->browser_texture_create_calls >= 1 &&
		state->browser_texture_update_calls >= texture_levels &&
		state->browser_texture_bind_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_texture_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 4 &&
		state->last_draw_primitive_count == 2 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		(state->last_draw_transform_mask & 7u) == 7u &&
		draw_state != nullptr &&
		draw_state->alpha_blend_enable == TRUE &&
		draw_state->src_blend == D3DBLEND_SRCALPHA &&
		draw_state->dest_blend == D3DBLEND_INVSRCALPHA &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_MODULATE &&
		stage0->values[D3DTSS_COLORARG1] == D3DTA_TEXTURE &&
		stage0->values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	const std::string archive_json = json_escape(texture_archive_path != nullptr ? texture_archive_path : "");
	const std::string image_filename_json = json_escape(image_filename);
	const std::string texture_name_json = json_escape(loaded_texture_name);
	const std::string texture_entry_json = json_escape(kDisplayDrawImageFileTextureArchiveEntry);
	const std::string runtime_assets_json = wasm_browser_runtime_assets_state_json();

	char buffer[10000];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_display_drawimage_file_probe\","
		"\"ok\":%s,"
		"\"archives\":{\"texture\":\"%s\"},"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
		"\"assetManagerCreated\":%s,\"usedExistingAssetManager\":%s,"
		"\"runtimeAssetSystemInstalled\":%s,"
		"\"textureArchiveLoaded\":%s,\"textureFileExists\":%s,"
		"\"textureFileFactoryInstalled\":%s,\"textureDDSAvailable\":%s,"
		"\"texturePreloaded\":%s,"
		"\"textureRegistered\":%s,\"textureResolved\":%s,"
		"\"textureDDSLoaded\":%s,\"textureHasD3DSurface\":%s,"
		"\"textureLevelDesc\":%ld,"
		"\"displayAllocated\":%s,\"displaySetup\":%s,\"imageAllocated\":%s,"
		"\"imageConfigured\":%s,\"beginRender\":%d,\"drawImageCalled\":%s,"
		"\"endRender\":%d},"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"browserTextureRelease\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"browserBufferRelease\":%u,\"setTexture\":%u,"
		"\"setTextureStageState\":%u,\"setStreamSource\":%u,"
		"\"setIndices\":%u,\"drawIndexed\":%u,\"setTransform\":%u,"
		"\"clear\":%u,\"present\":%u},"
		"\"texture\":{\"id\":%u,\"name\":\"%s\","
		"\"archiveEntry\":\"%s\",\"width\":%u,\"height\":%u,"
		"\"levels\":%u,\"uploadedLevels\":%u,\"format\":%lu,\"uploadFormat\":%lu,"
		"\"lastUpload\":{\"width\":%u,\"height\":%u,\"bytes\":%u,"
		"\"checksum\":%lu},"
		"\"source\":\"W3DDisplay::drawImage filename path via Render2DClass::Set_Texture, WW3DAssetManager, TextureClass::Apply, and runtime W3DFileSystem BIG archive\"},"
		"\"runtimeAssets\":%s,"
		"\"image\":{\"filename\":\"%s\",\"rawTexture\":%s,\"status\":%u,"
		"\"uvLoX\":%.3f,\"uvLoY\":%.3f,\"uvHiX\":%.3f,\"uvHiY\":%.3f,"
		"\"width\":%d,\"height\":%d},"
		"\"draw\":{\"primitiveType\":%d,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"indexBufferId\":%u,"
		"\"indexFormat\":%d,\"transformMask\":%u,"
		"\"renderState\":{\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,\"colorArg2\":%lu,"
		"\"alphaOp\":%lu,\"alphaArg1\":%lu,\"alphaArg2\":%lu,"
		"\"texCoordIndex\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu,\"texCoordIndex\":%lu}]}}}",
		bool_json(ok),
		archive_json.c_str(),
		init_result,
		set_device_result,
		bool_json(asset_manager_created),
		bool_json(used_existing_asset_manager),
		bool_json(runtime_asset_system_installed),
		bool_json(texture_archive_loaded),
		bool_json(texture_file_exists),
		bool_json(texture_file_factory_installed),
		bool_json(texture_dds_available),
		bool_json(texture_preloaded),
		bool_json(texture_registered),
		bool_json(texture_resolved),
		bool_json(texture_dds_loaded),
		bool_json(texture_has_d3d_surface),
		static_cast<long>(texture_level_desc_result),
		bool_json(display_allocated),
		bool_json(display_setup),
		bool_json(image_allocated),
		bool_json(image_configured),
		begin_render_result,
		bool_json(drawimage_called),
		end_render_result,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		texture_id,
		texture_name_json.c_str(),
		texture_entry_json.c_str(),
		texture_width,
		texture_height,
		texture_levels,
		texture_uploaded_levels,
		static_cast<unsigned long>(texture_format),
		static_cast<unsigned long>(texture_upload_format),
		texture_upload_width,
		texture_upload_height,
		texture_upload_bytes,
		static_cast<unsigned long>(texture_upload_checksum),
		runtime_assets_json.c_str(),
		image_filename_json.c_str(),
		bool_json(image_raw_texture),
		static_cast<unsigned int>(image_status),
		static_cast<double>(image_uv_lo_x),
		static_cast<double>(image_uv_lo_y),
		static_cast<double>(image_uv_hi_x),
		static_cast<double>(image_uv_hi_y),
		image_width,
		image_height,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->alpha_blend_enable : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->src_blend : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->dest_blend : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAOP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_TEXCOORDINDEX] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_TEXCOORDINDEX] : 0));

	g_ww3d_display_drawimage_file_probe_json = buffer;
	return g_ww3d_display_drawimage_file_probe_json.c_str();
}

const char *cnc_port_probe_ww3d_display_mapped_image_internal(
	const char *ini_archive_path,
	const char *texture_archive_path,
	const MappedImageDrawProbeSpec &spec,
	bool use_clip)
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	ImageCollection *old_mapped_image_collection = TheMappedImageCollection;
	GlobalData *old_global_data = TheGlobalData;
	GlobalData *old_writable_global_data = TheWritableGlobalData;
	TheGlobalData = nullptr;
	TheWritableGlobalData = nullptr;

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool used_existing_asset_manager = false;
	bool asset_manager_created = false;
	bool runtime_asset_system_installed = false;
	bool mapped_ini_exists = false;
	bool texture_archive_loaded = false;
	bool texture_file_exists = false;
	bool texture_file_factory_installed = false;
	bool mapped_collection_allocated = false;
	bool mapped_collection_loaded = false;
	bool mapped_image_found = false;
	bool mapped_image_rotated = false;
	bool image_raw_texture = false;
	bool texture_preloaded = false;
	bool texture_registered = false;
	bool texture_resolved = false;
	bool texture_loaded = false;
	bool texture_has_d3d_surface = false;
	bool display_allocated = false;
	bool display_setup = false;
	bool clip_region_set = false;
	bool clip_enabled_before_draw = false;
	bool clip_disabled_after_draw = false;
	bool drawimage_called = false;
	std::size_t mapped_image_count = 0;
	UnsignedInt image_status = 0;
	Int image_width = 0;
	Int image_height = 0;
	Int image_texture_width = 0;
	Int image_texture_height = 0;
	float image_uv_lo_x = 0.0f;
	float image_uv_lo_y = 0.0f;
	float image_uv_hi_x = 0.0f;
	float image_uv_hi_y = 0.0f;
	HRESULT texture_level_desc_result = E_FAIL;
	UINT texture_id = 0;
	UINT texture_width = 0;
	UINT texture_height = 0;
	UINT texture_levels = 0;
	UINT texture_uploaded_levels = 0;
	DWORD texture_format = D3DFMT_UNKNOWN;
	DWORD texture_upload_format = D3DFMT_UNKNOWN;
	UINT texture_upload_width = 0;
	UINT texture_upload_height = 0;
	UINT texture_upload_bytes = 0;
	DWORD texture_upload_checksum = 0;
	std::string image_filename;
	std::string loaded_texture_name;

	const Int draw_left = spec.draw_left;
	const Int draw_top = spec.draw_top;
	const Int draw_right = spec.draw_right;
	const Int draw_bottom = spec.draw_bottom;
	const Int clip_left = 360;
	const Int clip_top = 276;
	const Int clip_right = 440;
	const Int clip_bottom = 324;
	float expected_clipped_uv_left = 0.0f;
	float expected_clipped_uv_top = 0.0f;
	float expected_clipped_uv_right = 0.0f;
	float expected_clipped_uv_bottom = 0.0f;

	WW3DAssetManager *asset_manager = nullptr;
	ImageCollection *mapped_image_collection = nullptr;
	const Image *image = nullptr;
	ProbeW3DDisplayStorage display_storage;
	W3DDisplay *display = nullptr;

	if (succeeded(init_result)) {
		asset_manager = WW3DAssetManager::Get_Instance();
		used_existing_asset_manager = asset_manager != nullptr;
		if (asset_manager == nullptr) {
			asset_manager = W3DNEW WW3DAssetManager();
			asset_manager_created = asset_manager != nullptr;
		}
	}

	if (asset_manager != nullptr) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);

		runtime_asset_system_installed =
			wasm_browser_runtime_assets_install_archive_paths(ini_archive_path, texture_archive_path);
		const WasmBrowserRuntimeAssetsState &runtime_assets = wasm_browser_runtime_assets_state();
		texture_file_factory_installed = runtime_assets.w3d_file_system_installed;
		mapped_ini_exists =
			runtime_asset_system_installed &&
			wasm_browser_runtime_assets_file_exists(spec.sample_ini);
		texture_file_exists =
			runtime_asset_system_installed &&
			wasm_browser_runtime_assets_file_exists(spec.texture_archive_entry);
		texture_archive_loaded = texture_file_exists;
	}

	if (mapped_ini_exists && texture_file_exists) {
		mapped_image_collection = NEW ImageCollection;
		mapped_collection_allocated = mapped_image_collection != nullptr;
		if (mapped_collection_allocated) {
			TheMappedImageCollection = mapped_image_collection;
			mapped_image_collection->load(512);
			mapped_collection_loaded = true;
			mapped_image_count = count_mapped_images(*mapped_image_collection);
			image = mapped_image_collection->findImageByName(AsciiString(spec.image_name));
			mapped_image_found = image != nullptr;
			if (mapped_image_found) {
				image_status = image->getStatus();
				mapped_image_rotated = BitTest(image_status, IMAGE_STATUS_ROTATED_90_CLOCKWISE);
				image_raw_texture = BitTest(image_status, IMAGE_STATUS_RAW_TEXTURE);
				image_filename = image->getFilename().str() != nullptr ? image->getFilename().str() : "";
				const ICoord2D *texture_size = image->getTextureSize();
				image_texture_width = texture_size->x;
				image_texture_height = texture_size->y;
				const Region2D *image_uv = image->getUV();
				image_uv_lo_x = image_uv->lo.x;
				image_uv_lo_y = image_uv->lo.y;
				image_uv_hi_x = image_uv->hi.x;
				image_uv_hi_y = image_uv->hi.y;
				image_width = image->getImageWidth();
				image_height = image->getImageHeight();
				const float draw_width = static_cast<float>(draw_right - draw_left);
				const float draw_height = static_cast<float>(draw_bottom - draw_top);
				if (draw_width > 0.0f && draw_height > 0.0f) {
					const float uv_width = image_uv_hi_x - image_uv_lo_x;
					const float uv_height = image_uv_hi_y - image_uv_lo_y;
					const float clipped_left_percent =
						static_cast<float>(clip_left - draw_left) / draw_width;
					const float clipped_right_percent =
						static_cast<float>(clip_right - draw_left) / draw_width;
					const float clipped_top_percent =
						static_cast<float>(clip_top - draw_top) / draw_height;
					const float clipped_bottom_percent =
						static_cast<float>(clip_bottom - draw_top) / draw_height;
					expected_clipped_uv_top =
						image_uv_lo_y + (uv_height * clipped_left_percent);
					expected_clipped_uv_bottom =
						image_uv_lo_y + (uv_height * clipped_right_percent);
					expected_clipped_uv_right =
						image_uv_hi_x - (uv_width * clipped_top_percent);
					expected_clipped_uv_left =
						image_uv_hi_x - (uv_width * clipped_bottom_percent);
				}
			}
		}
	}

	if (asset_manager != nullptr && mapped_image_found && !image_filename.empty()) {
		TextureClass *preloaded_texture =
			asset_manager->Get_Texture(image_filename.c_str(), MIP_LEVELS_1);
		if (preloaded_texture != nullptr) {
			const char *registered_name = preloaded_texture->Get_Texture_Name();
			texture_registered =
				asset_manager->Texture_Hash().Get(image_filename.c_str()) == preloaded_texture ||
				(registered_name != nullptr &&
					asset_manager->Texture_Hash().Get(registered_name) == preloaded_texture);
			preloaded_texture->Init();
			texture_preloaded = preloaded_texture->Is_Initialized();
			preloaded_texture->Release_Ref();
		}
	}

	if (asset_manager != nullptr && texture_preloaded) {
		display = display_storage.prepare_for_2d_probe();
		display_allocated = display != nullptr;
		display_setup = display_allocated && display_storage.init_for_2d_probe(800, 600);
	}

	if (display_setup && mapped_image_found) {
		begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			if (use_clip) {
				IRegion2D clip_region = {};
				clip_region.lo.x = clip_left;
				clip_region.lo.y = clip_top;
				clip_region.hi.x = clip_right;
				clip_region.hi.y = clip_bottom;
				display->W3DDisplay::setClipRegion(&clip_region);
				clip_region_set = true;
				clip_enabled_before_draw = display->W3DDisplay::isClippingEnabled();
			}
			display->W3DDisplay::drawImage(image, draw_left, draw_top, draw_right, draw_bottom, 0xffffffffUL,
				Display::DRAW_IMAGE_ALPHA);
			drawimage_called = true;
			if (use_clip) {
				display->W3DDisplay::enableClipping(FALSE);
				clip_disabled_after_draw = !display->W3DDisplay::isClippingEnabled();
			}
			const WasmD3D8ShimState *render_state = wasm_d3d8_get_state();
			texture_id = render_state != nullptr ? render_state->last_set_texture_id : 0;
			end_render_result = WW3D::End_Render(false);
		}
	}

	TextureClass *loaded_texture =
		display_storage.render != nullptr ? display_storage.render->Peek_Texture() : nullptr;
	if (loaded_texture != nullptr) {
		texture_resolved = true;
		if (loaded_texture->Get_Texture_Name() != nullptr) {
			loaded_texture_name = loaded_texture->Get_Texture_Name();
		}
		texture_registered =
			asset_manager != nullptr &&
			(asset_manager->Texture_Hash().Get(image_filename.c_str()) == loaded_texture ||
				asset_manager->Texture_Hash().Get(loaded_texture_name.c_str()) == loaded_texture);
		texture_loaded = loaded_texture->Is_Initialized();
		IDirect3DTexture8 *d3d_texture = loaded_texture->Peek_D3D_Texture();
		texture_has_d3d_surface = d3d_texture != nullptr;
		if (d3d_texture != nullptr) {
			texture_uploaded_levels = d3d_texture->GetLevelCount();
			texture_levels = texture_uploaded_levels;
			D3DSURFACE_DESC texture_desc = {};
			texture_level_desc_result = d3d_texture->GetLevelDesc(0, &texture_desc);
			if (SUCCEEDED(texture_level_desc_result)) {
				texture_width = texture_desc.Width;
				texture_height = texture_desc.Height;
				texture_format = texture_desc.Format;
				texture_upload_format = texture_desc.Format;
				texture_upload_width = texture_desc.Width;
				texture_upload_height = texture_desc.Height;
			}
		}
	}

	display_storage.release_probe_renderer();

	if (mapped_image_collection != nullptr) {
		delete mapped_image_collection;
		mapped_image_collection = nullptr;
	}
	TheMappedImageCollection = old_mapped_image_collection;
	TheWritableGlobalData = old_writable_global_data;
	TheGlobalData = old_global_data;

	if (asset_manager_created && asset_manager != nullptr) {
		delete asset_manager;
		asset_manager = nullptr;
	}

	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	if (state != nullptr) {
		if (texture_id == 0) {
			texture_id = state->last_set_texture_id;
		}
		texture_upload_bytes = state->last_browser_texture_bytes;
		texture_upload_checksum = state->last_browser_texture_checksum;
	}
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		(asset_manager_created || used_existing_asset_manager) &&
		runtime_asset_system_installed &&
		mapped_ini_exists &&
		texture_archive_loaded &&
		texture_file_exists &&
		texture_file_factory_installed &&
		mapped_collection_allocated &&
		mapped_collection_loaded &&
		mapped_image_count == 1186 &&
		mapped_image_found &&
		mapped_image_rotated == spec.expected_rotated &&
		!image_raw_texture &&
		image_status == spec.expected_status &&
		image_filename == spec.texture_name &&
		image_texture_width == 512 &&
		image_texture_height == 512 &&
		image_width == spec.expected_width &&
		image_height == spec.expected_height &&
		texture_preloaded &&
		texture_registered &&
		texture_resolved &&
		texture_loaded &&
		texture_has_d3d_surface &&
		display_allocated &&
		display_setup &&
		succeeded(begin_render_result) &&
		(!use_clip || (clip_region_set && clip_enabled_before_draw && clip_disabled_after_draw)) &&
		drawimage_called &&
		succeeded(end_render_result) &&
		equals_ignore_ascii_case(loaded_texture_name, image_filename) &&
		texture_id != 0 &&
		texture_width == 512 &&
		texture_height == 512 &&
		texture_levels > 0 &&
		texture_uploaded_levels == texture_levels &&
		state->create_device_calls >= 1 &&
		state->create_texture_calls >= 1 &&
		state->browser_texture_create_calls >= 1 &&
		state->browser_texture_update_calls >= texture_levels &&
		state->browser_texture_bind_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_texture_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == spec.expected_vertex_count &&
		state->last_draw_primitive_count == 2 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		(state->last_draw_transform_mask & 7u) == 7u &&
		draw_state != nullptr &&
		draw_state->alpha_blend_enable == TRUE &&
		draw_state->src_blend == D3DBLEND_SRCALPHA &&
		draw_state->dest_blend == D3DBLEND_INVSRCALPHA &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_MODULATE &&
		stage0->values[D3DTSS_COLORARG1] == D3DTA_TEXTURE &&
		stage0->values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	const std::string ini_archive_json = json_escape(ini_archive_path != nullptr ? ini_archive_path : "");
	const std::string texture_archive_json =
		json_escape(texture_archive_path != nullptr ? texture_archive_path : "");
	const std::string image_filename_json = json_escape(image_filename);
	const std::string texture_name_json = json_escape(loaded_texture_name);
	const std::string texture_entry_json = json_escape(spec.texture_archive_entry);
	const std::string image_name_json = json_escape(spec.image_name);
	const std::string texture_source_json = json_escape(spec.texture_source);
	const std::string runtime_assets_json = wasm_browser_runtime_assets_state_json();
	const char *source_name = use_clip ?
		"ww3d_display_mapped_image_clip_probe" :
		spec.source_name;

	char buffer[14000];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"%s\","
		"\"ok\":%s,"
		"\"archives\":{\"ini\":\"%s\",\"texture\":\"%s\"},"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
		"\"assetManagerCreated\":%s,\"usedExistingAssetManager\":%s,"
		"\"runtimeAssetSystemInstalled\":%s,\"mappedIniExists\":%s,"
		"\"textureArchiveLoaded\":%s,\"textureFileExists\":%s,"
		"\"textureFileFactoryInstalled\":%s,"
		"\"mappedCollectionAllocated\":%s,\"mappedCollectionLoaded\":%s,"
		"\"mappedImages\":%zu,\"mappedImageFound\":%s,"
		"\"mappedImageRotated\":%s,\"texturePreloaded\":%s,"
		"\"textureRegistered\":%s,\"textureResolved\":%s,"
		"\"textureLoaded\":%s,\"textureHasD3DSurface\":%s,"
		"\"textureLevelDesc\":%ld,\"displayAllocated\":%s,"
		"\"displaySetup\":%s,\"beginRender\":%d,"
		"\"clipRegionSet\":%s,\"clipEnabledBeforeDraw\":%s,"
		"\"clipDisabledAfterDraw\":%s,"
		"\"drawImageCalled\":%s,\"endRender\":%d},"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"browserTextureRelease\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"browserBufferRelease\":%u,\"setTexture\":%u,"
		"\"setTextureStageState\":%u,\"setStreamSource\":%u,"
		"\"setIndices\":%u,\"drawIndexed\":%u,\"setTransform\":%u,"
		"\"clear\":%u,\"present\":%u},"
		"\"texture\":{\"id\":%u,\"name\":\"%s\","
		"\"archiveEntry\":\"%s\",\"width\":%u,\"height\":%u,"
		"\"levels\":%u,\"uploadedLevels\":%u,\"format\":%lu,\"uploadFormat\":%lu,"
		"\"lastUpload\":{\"width\":%u,\"height\":%u,\"bytes\":%u,"
		"\"checksum\":%lu},"
		"\"source\":\"%s\"},"
		"\"runtimeAssets\":%s,"
		"\"image\":{\"name\":\"%s\",\"filename\":\"%s\",\"rawTexture\":%s,"
		"\"status\":%u,\"rotated\":%s,\"textureWidth\":%d,\"textureHeight\":%d,"
		"\"uvLoX\":%.6f,\"uvLoY\":%.6f,\"uvHiX\":%.6f,\"uvHiY\":%.6f,"
		"\"width\":%d,\"height\":%d},"
		"\"draw\":{\"primitiveType\":%d,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"indexBufferId\":%u,"
		"\"indexFormat\":%d,\"transformMask\":%u,"
		"\"screenRect\":{\"left\":%d,\"top\":%d,\"right\":%d,\"bottom\":%d},"
		"\"clip\":{\"enabled\":%s,\"set\":%s,\"enabledBeforeDraw\":%s,"
		"\"disabledAfterDraw\":%s,"
		"\"rect\":{\"left\":%d,\"top\":%d,\"right\":%d,\"bottom\":%d},"
		"\"width\":%d,\"height\":%d,"
		"\"expectedRotatedUV\":{\"left\":%.6f,\"top\":%.6f,"
		"\"right\":%.6f,\"bottom\":%.6f}},"
		"\"renderState\":{\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,\"colorArg2\":%lu,"
		"\"alphaOp\":%lu,\"alphaArg1\":%lu,\"alphaArg2\":%lu,"
		"\"texCoordIndex\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu,\"texCoordIndex\":%lu}]}}}",
		source_name,
		bool_json(ok),
		ini_archive_json.c_str(),
		texture_archive_json.c_str(),
		init_result,
		set_device_result,
		bool_json(asset_manager_created),
		bool_json(used_existing_asset_manager),
		bool_json(runtime_asset_system_installed),
		bool_json(mapped_ini_exists),
		bool_json(texture_archive_loaded),
		bool_json(texture_file_exists),
		bool_json(texture_file_factory_installed),
		bool_json(mapped_collection_allocated),
		bool_json(mapped_collection_loaded),
		mapped_image_count,
		bool_json(mapped_image_found),
		bool_json(mapped_image_rotated),
		bool_json(texture_preloaded),
		bool_json(texture_registered),
		bool_json(texture_resolved),
		bool_json(texture_loaded),
		bool_json(texture_has_d3d_surface),
		static_cast<long>(texture_level_desc_result),
		bool_json(display_allocated),
		bool_json(display_setup),
		begin_render_result,
		bool_json(clip_region_set),
		bool_json(clip_enabled_before_draw),
		bool_json(clip_disabled_after_draw),
		bool_json(drawimage_called),
		end_render_result,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		texture_id,
		texture_name_json.c_str(),
		texture_entry_json.c_str(),
		texture_width,
		texture_height,
		texture_levels,
		texture_uploaded_levels,
		static_cast<unsigned long>(texture_format),
		static_cast<unsigned long>(texture_upload_format),
		texture_upload_width,
		texture_upload_height,
		texture_upload_bytes,
		static_cast<unsigned long>(texture_upload_checksum),
		texture_source_json.c_str(),
		runtime_assets_json.c_str(),
		image_name_json.c_str(),
		image_filename_json.c_str(),
		bool_json(image_raw_texture),
		static_cast<unsigned int>(image_status),
		bool_json(mapped_image_rotated),
		image_texture_width,
		image_texture_height,
		static_cast<double>(image_uv_lo_x),
		static_cast<double>(image_uv_lo_y),
		static_cast<double>(image_uv_hi_x),
		static_cast<double>(image_uv_hi_y),
		image_width,
		image_height,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		draw_left,
		draw_top,
		draw_right,
		draw_bottom,
		bool_json(use_clip),
		bool_json(clip_region_set),
		bool_json(clip_enabled_before_draw),
		bool_json(clip_disabled_after_draw),
		clip_left,
		clip_top,
		clip_right,
		clip_bottom,
		clip_right - clip_left,
		clip_bottom - clip_top,
		static_cast<double>(expected_clipped_uv_left),
		static_cast<double>(expected_clipped_uv_top),
		static_cast<double>(expected_clipped_uv_right),
		static_cast<double>(expected_clipped_uv_bottom),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->alpha_blend_enable : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->src_blend : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->dest_blend : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAOP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_TEXCOORDINDEX] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_TEXCOORDINDEX] : 0));

	std::string *probe_json = &g_ww3d_display_mapped_image_probe_json;
	if (use_clip) {
		probe_json = &g_ww3d_display_mapped_image_clip_probe_json;
	} else if (&spec == &kUnrotatedMappedImageProbeSpec) {
		probe_json = &g_ww3d_display_mapped_image_unrotated_probe_json;
	}
	*probe_json = buffer;
	return probe_json->c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_mapped_image(
	const char *ini_archive_path,
	const char *texture_archive_path)
{
	return cnc_port_probe_ww3d_display_mapped_image_internal(
		ini_archive_path,
		texture_archive_path,
		kMappedImageProbeSpec,
		false);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_mapped_image_clip(
	const char *ini_archive_path,
	const char *texture_archive_path)
{
	return cnc_port_probe_ww3d_display_mapped_image_internal(
		ini_archive_path,
		texture_archive_path,
		kMappedImageProbeSpec,
		true);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_mapped_image_unrotated(
	const char *ini_archive_path,
	const char *texture_archive_path)
{
	return cnc_port_probe_ww3d_display_mapped_image_internal(
		ini_archive_path,
		texture_archive_path,
		kUnrotatedMappedImageProbeSpec,
		false);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_fillrect()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool display_allocated = false;
	bool display_setup = false;
	bool draw_fill_rect_called = false;

	ProbeW3DDisplayStorage display_storage;
	W3DDisplay *display = nullptr;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		display = display_storage.prepare_for_2d_probe();
		display_allocated = display != nullptr;
		display_setup = display_allocated && display_storage.init_for_2d_probe(800, 600);
	}

	if (display_setup) {
		begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			display->W3DDisplay::drawFillRect(300, 220, 200, 160, 0xff00ff00UL);
			draw_fill_rect_called = true;
			end_render_result = WW3D::End_Render(false);
		}
	}

	display_storage.release_probe_renderer();

	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		display_allocated &&
		display_setup &&
		succeeded(begin_render_result) &&
		draw_fill_rect_called &&
		succeeded(end_render_result) &&
		state->create_device_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_texture_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 4 &&
		state->last_draw_primitive_count == 2 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		state->last_draw_index_format == D3DFMT_INDEX16 &&
		(state->last_draw_transform_mask & 7u) == 7u &&
		draw_state != nullptr &&
		draw_state->alpha_blend_enable == TRUE &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_SELECTARG2 &&
		stage0->values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	char buffer[4400];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_display_fillrect_probe\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
		"\"displayAllocated\":%s,\"displaySetup\":%s,"
		"\"beginRender\":%d,\"drawFillRectCalled\":%s,"
		"\"endRender\":%d},"
		"\"display\":{\"width\":%u,\"height\":%u,\"bitDepth\":%u,"
		"\"windowed\":%s,\"path\":\"W3DDisplay::drawFillRect\"},"
		"\"calls\":{\"createDevice\":%u,\"browserBufferCreate\":%u,"
		"\"browserBufferUpdate\":%u,\"browserBufferRelease\":%u,"
		"\"setTexture\":%u,\"setTextureStageState\":%u,"
		"\"setStreamSource\":%u,\"setIndices\":%u,\"drawIndexed\":%u,"
		"\"setTransform\":%u,\"clear\":%u,\"present\":%u},"
		"\"draw\":{\"primitiveType\":%d,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"indexBufferId\":%u,"
		"\"indexFormat\":%d,\"transformMask\":%u,"
		"\"expectedCenter\":[0,255,0,255],"
		"\"renderState\":{\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,"
		"\"colorArg2\":%lu,\"alphaOp\":%lu,\"alphaArg1\":%lu,"
		"\"alphaArg2\":%lu,\"texCoordIndex\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu,\"texCoordIndex\":%lu}]}}}",
		bool_json(ok),
		init_result,
		set_device_result,
		bool_json(display_allocated),
		bool_json(display_setup),
		begin_render_result,
		bool_json(draw_fill_rect_called),
		end_render_result,
		display != nullptr ? display->m_width : 0,
		display != nullptr ? display->m_height : 0,
		display != nullptr ? display->m_bitDepth : 0,
		bool_json(display != nullptr && display->m_windowed == TRUE),
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->alpha_blend_enable : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->src_blend : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->dest_blend : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAOP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_TEXCOORDINDEX] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_TEXCOORDINDEX] : 0));

	g_ww3d_display_fillrect_probe_json = buffer;
	return g_ww3d_display_fillrect_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_window_repaint()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	constexpr Int button_x = 300;
	constexpr Int button_y = 220;
	constexpr Int button_width = 200;
	constexpr Int button_height = 160;
	constexpr Color fill_color = static_cast<Color>(0xff00ff00UL);
	constexpr Color border_color = static_cast<Color>(0xffffff00UL);

	GlobalData global_data;
	SubsystemInterfaceList subsystem_list;
	ProbeFontLibrary font_library;
	GlobalData *old_global_data = TheGlobalData;
	GlobalData *old_writable_global_data = TheWritableGlobalData;
	SubsystemInterfaceList *old_subsystem_list = TheSubsystemList;
	Display *old_display = TheDisplay;
	FontLibrary *old_font_library = TheFontLibrary;
	GameWindowManager *old_window_manager = TheWindowManager;
	GameWindowTransitionsHandler *old_transition_handler = TheTransitionHandler;

	TheGlobalData = &global_data;
	TheWritableGlobalData = &global_data;
	TheSubsystemList = &subsystem_list;
	TheFontLibrary = &font_library;
	TheTransitionHandler = nullptr;
	font_library.init();

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	Int destroy_result = WIN_ERR_GENERAL_FAILURE;
	bool display_allocated = false;
	bool display_setup = false;
	bool manager_allocated = false;
	bool root_allocated = false;
	bool button_allocated = false;
	bool callbacks_bound = false;
	bool colors_set = false;
	bool begin_repaint_called = false;
	bool repaint_called = false;
	bool window_list_cleared = false;
	UnsignedInt draw_calls_before_repaint = 0;
	UnsignedInt draw_calls_after_repaint = 0;

	ProbeW3DDisplayStorage display_storage;
	ProbeForwardingW3DDisplay display_adapter;
	W3DDisplay *display = nullptr;
	W3DGameWindowManager *manager = nullptr;
	GameWindow *root = nullptr;
	GameWindow *button = nullptr;
	WinInstanceData button_instance;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
		display = display_storage.prepare_for_2d_probe();
		display_allocated = display != nullptr;
		display_setup = display_allocated && display_storage.init_for_2d_probe(800, 600);
	}

	if (display_setup) {
		display_adapter.setW3DDisplay(display);
		display_adapter.configure(display->m_width, display->m_height, display->m_bitDepth,
			display->m_windowed);
		TheDisplay = &display_adapter;
		manager = NEW W3DGameWindowManager;
		manager_allocated = manager != nullptr;
		if (manager != nullptr) {
			TheWindowManager = manager;
		}
	}

	if (manager != nullptr) {
		root = manager->winCreate(nullptr,
			WIN_STATUS_ENABLED | WIN_STATUS_SEE_THRU,
			0,
			0,
			800,
			600,
			nullptr,
			nullptr);
		root_allocated = root != nullptr;
	}

	if (root != nullptr) {
		button_instance.init();
		BitSet(button_instance.m_style, GWS_PUSH_BUTTON | GWS_MOUSE_TRACK);
		button = manager->gogoGadgetPushButton(root,
			WIN_STATUS_ENABLED,
			button_x,
			button_y,
			button_width,
			button_height,
			&button_instance,
			nullptr,
			FALSE);
		button_allocated = button != nullptr;
	}

	if (button != nullptr) {
		callbacks_bound =
			manager->getPushButtonDrawFunc() == W3DGadgetPushButtonDraw &&
			button->winGetDrawFunc() == W3DGadgetPushButtonDraw &&
			button->winGetInputFunc() == GadgetPushButtonInput &&
			button->winGetParent() == root;
		GadgetButtonSetEnabledColor(button, fill_color);
		GadgetButtonSetEnabledBorderColor(button, border_color);
		colors_set =
			GadgetButtonGetEnabledColor(button) == fill_color &&
			GadgetButtonGetEnabledBorderColor(button) == border_color;
	}

	const WasmD3D8ShimState *state_before = wasm_d3d8_get_state();
	draw_calls_before_repaint = state_before != nullptr ? state_before->draw_indexed_primitive_calls : 0;

	if (callbacks_bound && colors_set) {
		begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			begin_repaint_called = true;
			manager->winRepaint();
			repaint_called = true;
			end_render_result = WW3D::End_Render(false);
		}
	}

	const WasmD3D8ShimState *state_after = wasm_d3d8_get_state();
	draw_calls_after_repaint = state_after != nullptr ? state_after->draw_indexed_primitive_calls : 0;

	if (manager != nullptr && root != nullptr) {
		destroy_result = manager->winDestroy(root);
		manager->update();
		window_list_cleared = manager->winGetWindowList() == nullptr;
		root = nullptr;
		button = nullptr;
	}

	if (manager != nullptr) {
		TheTransitionHandler = nullptr;
		delete manager;
		manager = nullptr;
	}

	display_storage.release_probe_renderer();

	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}

	font_library.reset();
	TheTransitionHandler = old_transition_handler;
	TheWindowManager = old_window_manager;
	TheFontLibrary = old_font_library;
	TheDisplay = old_display;
	TheSubsystemList = old_subsystem_list;
	TheWritableGlobalData = old_writable_global_data;
	TheGlobalData = old_global_data;

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		display_allocated &&
		display_setup &&
		manager_allocated &&
		root_allocated &&
		button_allocated &&
		callbacks_bound &&
		colors_set &&
		succeeded(begin_render_result) &&
		begin_repaint_called &&
		repaint_called &&
		succeeded(end_render_result) &&
		destroy_result == WIN_ERR_OK &&
		window_list_cleared &&
		display_adapter.openRectDraws() >= 1 &&
		display_adapter.fillRectDraws() >= 1 &&
		draw_calls_after_repaint >= draw_calls_before_repaint + 2 &&
		state->draw_indexed_primitive_calls >= 2 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 4 &&
		state->last_draw_primitive_count == 2 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		state->last_draw_index_format == D3DFMT_INDEX16 &&
		(state->last_draw_transform_mask & 7u) == 7u &&
		draw_state != nullptr &&
		draw_state->alpha_blend_enable == TRUE &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_SELECTARG2 &&
		stage0->values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	char buffer[6400];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_window_repaint_probe\","
		"\"ok\":%s,"
		"\"originalPaths\":["
		"\"W3DGameWindowManager::gogoGadgetPushButton\","
		"\"GameWindowManager::winRepaint -> W3DGadgetPushButtonDraw\","
		"\"GameWindowManager::winOpenRect/winFillRect -> TheDisplay virtual dispatch\","
		"\"ProbeForwardingW3DDisplay -> W3DDisplay::drawOpenRect/drawFillRect\"],"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
		"\"displayAllocated\":%s,\"displaySetup\":%s,"
		"\"managerAllocated\":%s,\"rootAllocated\":%s,"
		"\"buttonAllocated\":%s,\"callbacksBound\":%s,"
		"\"colorsSet\":%s,\"beginRender\":%d,"
		"\"beginRepaintCalled\":%s,\"repaintCalled\":%s,"
		"\"endRender\":%d,\"destroyResult\":%d,"
		"\"windowListCleared\":%s},"
		"\"window\":{\"manager\":\"W3DGameWindowManager\","
		"\"rootSeeThrough\":%s,\"button\":{\"x\":%d,\"y\":%d,"
		"\"width\":%d,\"height\":%d,\"drawFunc\":\"W3DGadgetPushButtonDraw\","
		"\"inputFunc\":\"GadgetPushButtonInput\","
		"\"fillColor\":[0,255,0,255],\"borderColor\":[255,255,0,255]}},"
		"\"display\":{\"width\":%u,\"height\":%u,\"bitDepth\":%u,"
		"\"windowed\":%s,\"path\":\"GameWindowManager::winRepaint -> Display adapter -> W3DDisplay\"},"
		"\"calls\":{\"createDevice\":%u,\"browserBufferCreate\":%u,"
		"\"browserBufferUpdate\":%u,\"browserBufferRelease\":%u,"
		"\"setTexture\":%u,\"setTextureStageState\":%u,"
		"\"setStreamSource\":%u,\"setIndices\":%u,\"drawIndexed\":%u,"
		"\"drawIndexedBeforeRepaint\":%u,\"drawIndexedAfterRepaint\":%u,"
		"\"displayOpenRect\":%d,\"displayFillRect\":%d,"
		"\"setTransform\":%u,\"clear\":%u,\"present\":%u},"
		"\"draw\":{\"primitiveType\":%d,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"indexBufferId\":%u,"
		"\"indexFormat\":%d,\"transformMask\":%u,"
		"\"expectedCenter\":[0,255,0,255],"
		"\"renderState\":{\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,"
		"\"colorArg2\":%lu,\"alphaOp\":%lu,\"alphaArg1\":%lu,"
		"\"alphaArg2\":%lu,\"texCoordIndex\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu,\"texCoordIndex\":%lu}]}}}",
		bool_json(ok),
		init_result,
		set_device_result,
		bool_json(display_allocated),
		bool_json(display_setup),
		bool_json(manager_allocated),
		bool_json(root_allocated),
		bool_json(button_allocated),
		bool_json(callbacks_bound),
		bool_json(colors_set),
		begin_render_result,
		bool_json(begin_repaint_called),
		bool_json(repaint_called),
		end_render_result,
		destroy_result,
		bool_json(window_list_cleared),
		bool_json(root_allocated),
		button_x,
		button_y,
		button_width,
		button_height,
		display != nullptr ? display->m_width : 0,
		display != nullptr ? display->m_height : 0,
		display != nullptr ? display->m_bitDepth : 0,
		bool_json(display != nullptr && display->m_windowed == TRUE),
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		draw_calls_before_repaint,
		draw_calls_after_repaint,
		display_adapter.openRectDraws(),
		display_adapter.fillRectDraws(),
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->alpha_blend_enable : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->src_blend : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->dest_blend : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAOP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_TEXCOORDINDEX] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_TEXCOORDINDEX] : 0));

	g_ww3d_window_repaint_probe_json = buffer;
	return g_ww3d_window_repaint_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_window_layout_repaint(const char *window_archive_path)
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	constexpr const char *layout_path = "Menus/Defeat.wnd";
	constexpr const char *archive_window_path = "Window\\Menus\\Defeat.wnd";
	constexpr const char *root_name = "Defeat.wnd:Defeat";
	constexpr const char *parent_name = "Defeat.wnd:Defeat";
	constexpr const char *ok_button_name = "Defeat.wnd:DefeatImage";

	GlobalData global_data;
	SubsystemInterfaceList subsystem_list;
	ProbeFontLibrary font_library;
	ProbeDisplayStringManager display_string_manager;
	ProbeGameText game_text;
	HeaderTemplateManager header_templates;
	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	NameKeyGenerator name_key_generator;
	ProbeW3DWindowLayoutFunctionLexicon function_lexicon;
	ImageCollection *mapped_image_collection = nullptr;

	GlobalData *old_global_data = TheGlobalData;
	GlobalData *old_writable_global_data = TheWritableGlobalData;
	SubsystemInterfaceList *old_subsystem_list = TheSubsystemList;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	FileSystem *old_file_system = TheFileSystem;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	Display *old_display = TheDisplay;
	FontLibrary *old_font_library = TheFontLibrary;
	DisplayStringManager *old_display_string_manager = TheDisplayStringManager;
	GameTextInterface *old_game_text = TheGameText;
	HeaderTemplateManager *old_header_templates = TheHeaderTemplateManager;
	GameWindowManager *old_window_manager = TheWindowManager;
	FunctionLexicon *old_function_lexicon = TheFunctionLexicon;
	ImageCollection *old_mapped_image_collection = TheMappedImageCollection;
	GameWindowTransitionsHandler *old_transition_handler = TheTransitionHandler;
	bool archive_path_argument_supplied = false;
	bool runtime_asset_system_installed = false;
	bool name_keys_ready = false;
	bool archive_window_exists = false;
	bool archive_window_openable = false;
	std::string effective_archive_path;
	std::string effective_archive_directory;
	std::string effective_archive_mask;

	TheGlobalData = &global_data;
	TheWritableGlobalData = &global_data;
	TheSubsystemList = &subsystem_list;
	TheFontLibrary = &font_library;
	TheDisplayStringManager = &display_string_manager;
	TheGameText = &game_text;
	TheHeaderTemplateManager = &header_templates;
	TheFunctionLexicon = &function_lexicon;
	TheTransitionHandler = nullptr;
	font_library.init();
	display_string_manager.init();
	game_text.init();

	archive_path_argument_supplied =
		window_archive_path != nullptr &&
		window_archive_path[0] != '\0';
	if (archive_path_argument_supplied) {
		effective_archive_path = window_archive_path;
		split_archive_path_for_probe(
			effective_archive_path,
			effective_archive_directory,
			effective_archive_mask);
	} else {
		wasm_browser_runtime_assets_restore_globals();
		const WasmBrowserRuntimeAssetsState &runtime_assets =
			wasm_browser_runtime_assets_state();
		effective_archive_directory = runtime_assets.archive_directory;
		effective_archive_mask = runtime_assets.archive_file_mask;
		effective_archive_path = runtime_assets.archive_directory;
		effective_archive_path += runtime_assets.archive_file_mask;
	}
	TheLocalFileSystem = &local_file_system;
	TheArchiveFileSystem = &archive_file_system;
	TheFileSystem = &file_system;
	TheNameKeyGenerator = &name_key_generator;
	local_file_system.init();
	archive_file_system.init();
	file_system.init();
	name_key_generator.init();
	runtime_asset_system_installed =
		!effective_archive_mask.empty() &&
		archive_file_system.loadBigFilesFromDirectory(
			AsciiString(effective_archive_directory.c_str()),
			AsciiString(effective_archive_mask.c_str()),
			TRUE);
	name_keys_ready = TheNameKeyGenerator != nullptr;
	archive_window_exists =
		runtime_asset_system_installed &&
		TheFileSystem != nullptr &&
		TheFileSystem->doesFileExist(archive_window_path);

	FileFactoryClass *ww3d_init_file_factory = _TheFileFactory;
	ProbeNullMissingFileFactory ww3d_init_null_missing_factory(ww3d_init_file_factory);
	_TheFileFactory = &ww3d_init_null_missing_factory;
	const int init_result = WW3D::Init(nullptr, nullptr, false);
	_TheFileFactory = ww3d_init_file_factory;
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	Int destroy_result = WIN_ERR_GENERAL_FAILURE;
	bool display_allocated = false;
	bool display_setup = false;
	bool manager_allocated = false;
	bool mapped_collection_allocated = false;
	bool function_lexicon_initialized = false;
	bool callbacks_resolved = false;
	bool layout_loaded = false;
	bool root_found = false;
	bool parent_found = false;
	bool ok_button_found = false;
	bool root_callback_bound = false;
	bool parent_callback_bound = false;
	bool ok_button_hidden = false;
	bool children_pruned = false;
	bool begin_repaint_called = false;
	bool repaint_called = false;
	bool window_list_cleared = false;
	Int layout_window_count = 0;
	Int hidden_child_count = 0;
	Int root_x = 0;
	Int root_y = 0;
	Int root_width = 0;
	Int root_height = 0;
	Int parent_x = 0;
	Int parent_y = 0;
	Int parent_width = 0;
	Int parent_height = 0;
	Color parent_color = WIN_COLOR_UNDEFINED;
	Color parent_border_color = WIN_COLOR_UNDEFINED;
	UnsignedInt draw_calls_before_repaint = 0;
	UnsignedInt draw_calls_after_repaint = 0;

	ProbeW3DDisplayStorage display_storage;
	ProbeForwardingW3DDisplay display_adapter;
	W3DDisplay *display = nullptr;
	W3DGameWindowManager *manager = nullptr;
	WindowLayout *layout = nullptr;
	GameWindow *root = nullptr;
	GameWindow *parent = nullptr;
	GameWindow *ok_button = nullptr;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
	}

	if (archive_window_exists && name_keys_ready) {
		function_lexicon.init();
		function_lexicon_initialized = true;
		callbacks_resolved =
			function_lexicon.gameWinSystemFunc(
				TheNameKeyGenerator->nameToKey(AsciiString("GameWinDefaultSystem"))) == GameWinDefaultSystem &&
			function_lexicon.gameWinInputFunc(
				TheNameKeyGenerator->nameToKey(AsciiString("GameWinDefaultInput"))) == GameWinDefaultInput &&
			function_lexicon.gameWinDrawFunc(
				TheNameKeyGenerator->nameToKey(AsciiString("W3DGameWinDefaultDraw"))) == W3DGameWinDefaultDraw;
		mapped_image_collection = NEW ImageCollection;
		mapped_collection_allocated = mapped_image_collection != nullptr;
		if (mapped_collection_allocated) {
			TheMappedImageCollection = mapped_image_collection;
		}
	}

	if (callbacks_resolved && mapped_collection_allocated) {
		display = display_storage.prepare_for_2d_probe();
		display_allocated = display != nullptr;
		display_setup = display_allocated && display_storage.init_for_2d_probe(800, 600);
	}

	if (display_setup) {
		display_adapter.setW3DDisplay(display);
		display_adapter.configure(display->m_width, display->m_height, display->m_bitDepth,
			display->m_windowed);
		TheDisplay = &display_adapter;
		manager = NEW W3DGameWindowManager;
		manager_allocated = manager != nullptr;
		if (manager != nullptr) {
			TheWindowManager = manager;
		}
	}

	if (manager != nullptr) {
		if (TheFileSystem != nullptr) {
			File *archive_window_file = TheFileSystem->openFile(archive_window_path, File::READ);
			archive_window_openable = archive_window_file != nullptr;
			if (archive_window_file != nullptr) {
				archive_window_file->close();
			}
		}
		layout = manager->winCreateLayout(AsciiString(layout_path));
		layout_loaded = layout != nullptr;
		layout_window_count = count_layout_windows(layout);
		root = layout != nullptr ? layout->getFirstWindow() : nullptr;
		root_found = root != nullptr;
	}

	if (root != nullptr && name_keys_ready) {
		parent = root;
		ok_button = manager->winGetWindowFromId(
			root, TheNameKeyGenerator->nameToKey(AsciiString(ok_button_name)));
		parent_found = parent != nullptr;
		ok_button_found = ok_button != nullptr;
		root_callback_bound =
			root->winGetWindowId() == TheNameKeyGenerator->nameToKey(AsciiString(root_name)) &&
			root->winGetDrawFunc() == W3DGameWinDefaultDraw &&
			root->winGetSystemFunc() == GameWinDefaultSystem;
		if (parent != nullptr) {
			parent_callback_bound =
				parent->winGetDrawFunc() == W3DGameWinDefaultDraw &&
				parent->winGetSystemFunc() == GameWinDefaultSystem;
			parent_color = parent->winGetEnabledColor(0);
			parent_border_color = parent->winGetEnabledBorderColor(0);
			get_window_rect(parent, parent_x, parent_y, parent_width, parent_height);
		}
		if (ok_button != nullptr) {
			ok_button_hidden = BitTest(ok_button->winGetStatus(), WIN_STATUS_HIDDEN);
		}
		get_window_rect(root, root_x, root_y, root_width, root_height);
	}

	if (root_found && parent_found && root_callback_bound && parent_callback_bound) {
		hidden_child_count = hide_message_box_non_rect_children(root, parent);
		children_pruned = hidden_child_count >= 1;
		if (ok_button != nullptr) {
			ok_button_hidden = BitTest(ok_button->winGetStatus(), WIN_STATUS_HIDDEN);
		}
	}

	const WasmD3D8ShimState *state_before = wasm_d3d8_get_state();
	draw_calls_before_repaint = state_before != nullptr ? state_before->draw_indexed_primitive_calls : 0;

	if (children_pruned) {
		begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			begin_repaint_called = true;
			manager->winRepaint();
			repaint_called = true;
			end_render_result = WW3D::End_Render(false);
		}
	}

	const WasmD3D8ShimState *state_after = wasm_d3d8_get_state();
	draw_calls_after_repaint = state_after != nullptr ? state_after->draw_indexed_primitive_calls : 0;

	if (layout != nullptr) {
		layout->destroyWindows();
		layout->deleteInstance();
		layout = nullptr;
		if (manager != nullptr) {
			manager->update();
			window_list_cleared = manager->winGetWindowList() == nullptr;
		}
		root = nullptr;
		parent = nullptr;
		ok_button = nullptr;
		destroy_result = window_list_cleared ? WIN_ERR_OK : WIN_ERR_GENERAL_FAILURE;
	}

	if (manager != nullptr) {
		TheTransitionHandler = nullptr;
		delete manager;
		manager = nullptr;
	}

	display_storage.release_probe_renderer();

	if (mapped_image_collection != nullptr) {
		delete mapped_image_collection;
		mapped_image_collection = nullptr;
	}

	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}

	TheMappedImageCollection = old_mapped_image_collection;
	TheTransitionHandler = old_transition_handler;
	TheFunctionLexicon = old_function_lexicon;
	TheWindowManager = old_window_manager;
	TheHeaderTemplateManager = old_header_templates;
	TheGameText = old_game_text;
	TheDisplayStringManager = old_display_string_manager;
	TheFontLibrary = old_font_library;
	TheDisplay = old_display;
	TheNameKeyGenerator = old_name_key_generator;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;
	TheSubsystemList = old_subsystem_list;
	TheWritableGlobalData = old_writable_global_data;
	TheGlobalData = old_global_data;

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		runtime_asset_system_installed &&
		name_keys_ready &&
		archive_window_exists &&
		function_lexicon_initialized &&
		callbacks_resolved &&
		mapped_collection_allocated &&
		display_allocated &&
		display_setup &&
		manager_allocated &&
		layout_loaded &&
		layout_window_count >= 1 &&
		root_found &&
		parent_found &&
		ok_button_found &&
		root_callback_bound &&
		parent_callback_bound &&
		ok_button_hidden &&
		children_pruned &&
		parent_x == 96 &&
		parent_y == 120 &&
		parent_width == 604 &&
		parent_height == 220 &&
		parent_color == static_cast<Color>(0xff2f37a8UL) &&
		parent_border_color == static_cast<Color>(0xff2f37a8UL) &&
		succeeded(begin_render_result) &&
		begin_repaint_called &&
		repaint_called &&
		succeeded(end_render_result) &&
		destroy_result == WIN_ERR_OK &&
		window_list_cleared &&
		display_adapter.openRectDraws() >= 1 &&
		display_adapter.fillRectDraws() >= 1 &&
		draw_calls_after_repaint >= draw_calls_before_repaint + 2 &&
		state->draw_indexed_primitive_calls >= 2 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 4 &&
		state->last_draw_primitive_count == 2 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		state->last_draw_index_format == D3DFMT_INDEX16 &&
		(state->last_draw_transform_mask & 7u) == 7u &&
		draw_state != nullptr &&
		draw_state->alpha_blend_enable == TRUE &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_SELECTARG2 &&
		stage0->values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	const std::string archive_path_json = json_escape(effective_archive_path);
	const std::string archive_window_path_json = json_escape(archive_window_path);
	char buffer[8200];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_window_layout_repaint_probe\","
		"\"ok\":%s,"
		"\"originalPaths\":["
		"\"WindowLayout::load -> GameWindowManager::winCreateFromScript\","
		"\"Win32BIGFileSystem WindowZH.big -> Window\\\\Menus\\\\Defeat.wnd\","
		"\"W3DGameWindowManager::allocateNewWindow -> W3DGameWindow\","
		"\"GameWindowManager::winRepaint -> W3DGameWinDefaultDraw\","
		"\"GameWindowManager::winOpenRect/winFillRect -> TheDisplay virtual dispatch\","
		"\"ProbeForwardingW3DDisplay -> W3DDisplay::drawOpenRect/drawFillRect\"],"
		"\"archive\":{\"path\":\"%s\",\"entry\":\"%s\",\"exists\":%s,"
		"\"openable\":%s,\"runtimeInstalled\":%s,"
		"\"pathArgumentSupplied\":%s},"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
		"\"nameKeysReady\":%s,\"functionLexiconInitialized\":%s,"
		"\"callbacksResolved\":%s,\"mappedCollectionAllocated\":%s,"
		"\"displayAllocated\":%s,\"displaySetup\":%s,"
		"\"managerAllocated\":%s,\"layoutLoaded\":%s,"
		"\"layoutWindowCount\":%d,"
		"\"rootFound\":%s,"
		"\"parentFound\":%s,\"okButtonFound\":%s,"
		"\"rootCallbackBound\":%s,\"parentCallbackBound\":%s,"
		"\"okButtonHidden\":%s,\"childrenPruned\":%s,"
		"\"hiddenChildCount\":%d,\"beginRender\":%d,"
		"\"beginRepaintCalled\":%s,\"repaintCalled\":%s,"
		"\"endRender\":%d,\"destroyResult\":%d,"
		"\"windowListCleared\":%s},"
		"\"layout\":{\"path\":\"%s\",\"root\":{\"name\":\"%s\","
		"\"x\":%d,\"y\":%d,\"width\":%d,\"height\":%d,"
		"\"systemFunc\":\"GameWinDefaultSystem\","
		"\"drawFunc\":\"W3DGameWinDefaultDraw\"},"
		"\"parent\":{\"name\":\"%s\",\"x\":%d,\"y\":%d,"
		"\"width\":%d,\"height\":%d,"
		"\"systemFunc\":\"GameWinDefaultSystem\","
		"\"drawFunc\":\"W3DGameWinDefaultDraw\","
		"\"fillColor\":[%u,%u,%u,%u],"
		"\"borderColor\":[%u,%u,%u,%u]},"
		"\"prunedChildren\":%d},"
		"\"display\":{\"width\":%u,\"height\":%u,\"bitDepth\":%u,"
		"\"windowed\":%s,\"path\":\"WindowLayout::load -> GameWindowManager::winRepaint -> Display adapter -> W3DDisplay\"},"
		"\"calls\":{\"createDevice\":%u,\"browserBufferCreate\":%u,"
		"\"browserBufferUpdate\":%u,\"browserBufferRelease\":%u,"
		"\"setTexture\":%u,\"setTextureStageState\":%u,"
		"\"setStreamSource\":%u,\"setIndices\":%u,\"drawIndexed\":%u,"
		"\"drawIndexedBeforeRepaint\":%u,\"drawIndexedAfterRepaint\":%u,"
		"\"displayOpenRect\":%d,\"displayFillRect\":%d,"
		"\"setTransform\":%u,\"clear\":%u,\"present\":%u},"
		"\"draw\":{\"primitiveType\":%d,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"indexBufferId\":%u,"
		"\"indexFormat\":%d,\"transformMask\":%u,"
		"\"expectedBorder\":[47,55,168,255],"
		"\"renderState\":{\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,"
		"\"colorArg2\":%lu,\"alphaOp\":%lu,\"alphaArg1\":%lu,"
		"\"alphaArg2\":%lu,\"texCoordIndex\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu,\"texCoordIndex\":%lu}]}}}",
		bool_json(ok),
		archive_path_json.c_str(),
		archive_window_path_json.c_str(),
		bool_json(archive_window_exists),
		bool_json(archive_window_openable),
		bool_json(runtime_asset_system_installed),
		bool_json(archive_path_argument_supplied),
		init_result,
		set_device_result,
		bool_json(name_keys_ready),
		bool_json(function_lexicon_initialized),
		bool_json(callbacks_resolved),
		bool_json(mapped_collection_allocated),
		bool_json(display_allocated),
		bool_json(display_setup),
		bool_json(manager_allocated),
		bool_json(layout_loaded),
		layout_window_count,
		bool_json(root_found),
		bool_json(parent_found),
		bool_json(ok_button_found),
		bool_json(root_callback_bound),
		bool_json(parent_callback_bound),
		bool_json(ok_button_hidden),
		bool_json(children_pruned),
		hidden_child_count,
		begin_render_result,
		bool_json(begin_repaint_called),
		bool_json(repaint_called),
		end_render_result,
		destroy_result,
		bool_json(window_list_cleared),
		layout_path,
		root_name,
		root_x,
		root_y,
		root_width,
		root_height,
		parent_name,
		parent_x,
		parent_y,
		parent_width,
		parent_height,
		color_red(parent_color),
		color_green(parent_color),
		color_blue(parent_color),
		color_alpha(parent_color),
		color_red(parent_border_color),
		color_green(parent_border_color),
		color_blue(parent_border_color),
		color_alpha(parent_border_color),
		hidden_child_count,
		display != nullptr ? display->m_width : 0,
		display != nullptr ? display->m_height : 0,
		display != nullptr ? display->m_bitDepth : 0,
		bool_json(display != nullptr && display->m_windowed == TRUE),
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		draw_calls_before_repaint,
		draw_calls_after_repaint,
		display_adapter.openRectDraws(),
		display_adapter.fillRectDraws(),
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->alpha_blend_enable : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->src_blend : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->dest_blend : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAOP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_TEXCOORDINDEX] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_TEXCOORDINDEX] : 0));

	g_ww3d_window_layout_repaint_probe_json = buffer;
	return g_ww3d_window_layout_repaint_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_line()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool display_allocated = false;
	bool display_setup = false;
	bool draw_line_called = false;

	ProbeW3DDisplayStorage display_storage;
	W3DDisplay *display = nullptr;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		display = display_storage.prepare_for_2d_probe();
		display_allocated = display != nullptr;
		display_setup = display_allocated && display_storage.init_for_2d_probe(800, 600);
	}

	if (display_setup) {
		begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			display->W3DDisplay::drawLine(220, 300, 580, 300, 16.0f, 0xff00ff00UL);
			draw_line_called = true;
			end_render_result = WW3D::End_Render(false);
		}
	}

	display_storage.release_probe_renderer();

	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		display_allocated &&
		display_setup &&
		succeeded(begin_render_result) &&
		draw_line_called &&
		succeeded(end_render_result) &&
		state->create_device_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_texture_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 4 &&
		state->last_draw_primitive_count == 2 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		state->last_draw_index_format == D3DFMT_INDEX16 &&
		(state->last_draw_transform_mask & 7u) == 7u &&
		draw_state != nullptr &&
		draw_state->alpha_blend_enable == TRUE &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_SELECTARG2 &&
		stage0->values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	char buffer[4500];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_display_line_probe\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
		"\"displayAllocated\":%s,\"displaySetup\":%s,"
		"\"beginRender\":%d,\"drawLineCalled\":%s,"
		"\"endRender\":%d},"
		"\"display\":{\"width\":%u,\"height\":%u,\"bitDepth\":%u,"
		"\"windowed\":%s,\"path\":\"W3DDisplay::drawLine\","
		"\"line\":{\"startX\":220,\"startY\":300,"
		"\"endX\":580,\"endY\":300,\"width\":16}},"
		"\"calls\":{\"createDevice\":%u,\"browserBufferCreate\":%u,"
		"\"browserBufferUpdate\":%u,\"browserBufferRelease\":%u,"
		"\"setTexture\":%u,\"setTextureStageState\":%u,"
		"\"setStreamSource\":%u,\"setIndices\":%u,\"drawIndexed\":%u,"
		"\"setTransform\":%u,\"clear\":%u,\"present\":%u},"
		"\"draw\":{\"primitiveType\":%d,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"indexBufferId\":%u,"
		"\"indexFormat\":%d,\"transformMask\":%u,"
		"\"expectedCenter\":[0,255,0,255],"
		"\"renderState\":{\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,"
		"\"colorArg2\":%lu,\"alphaOp\":%lu,\"alphaArg1\":%lu,"
		"\"alphaArg2\":%lu,\"texCoordIndex\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu,\"texCoordIndex\":%lu}]}}}",
		bool_json(ok),
		init_result,
		set_device_result,
		bool_json(display_allocated),
		bool_json(display_setup),
		begin_render_result,
		bool_json(draw_line_called),
		end_render_result,
		display != nullptr ? display->m_width : 0,
		display != nullptr ? display->m_height : 0,
		display != nullptr ? display->m_bitDepth : 0,
		bool_json(display != nullptr && display->m_windowed == TRUE),
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->alpha_blend_enable : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->src_blend : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->dest_blend : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAOP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_TEXCOORDINDEX] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_TEXCOORDINDEX] : 0));

	g_ww3d_display_line_probe_json = buffer;
	return g_ww3d_display_line_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_line_gradient()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool display_allocated = false;
	bool display_setup = false;
	bool draw_line_gradient_called = false;

	ProbeW3DDisplayStorage display_storage;
	W3DDisplay *display = nullptr;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		display = display_storage.prepare_for_2d_probe();
		display_allocated = display != nullptr;
		display_setup = display_allocated && display_storage.init_for_2d_probe(800, 600);
	}

	if (display_setup) {
		begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			display->W3DDisplay::drawLine(220, 300, 580, 300, 16.0f,
				0xffff0000UL, 0xff0000ffUL);
			draw_line_gradient_called = true;
			end_render_result = WW3D::End_Render(false);
		}
	}

	display_storage.release_probe_renderer();

	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		display_allocated &&
		display_setup &&
		succeeded(begin_render_result) &&
		draw_line_gradient_called &&
		succeeded(end_render_result) &&
		state->create_device_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_texture_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 4 &&
		state->last_draw_primitive_count == 2 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		state->last_draw_index_format == D3DFMT_INDEX16 &&
		(state->last_draw_transform_mask & 7u) == 7u &&
		draw_state != nullptr &&
		draw_state->alpha_blend_enable == TRUE &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_SELECTARG2 &&
		stage0->values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	char buffer[4800];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_display_line_gradient_probe\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
		"\"displayAllocated\":%s,\"displaySetup\":%s,"
		"\"beginRender\":%d,\"drawLineGradientCalled\":%s,"
		"\"endRender\":%d},"
		"\"display\":{\"width\":%u,\"height\":%u,\"bitDepth\":%u,"
		"\"windowed\":%s,\"path\":\"W3DDisplay::drawLine(two-color)\","
		"\"line\":{\"startX\":220,\"startY\":300,"
		"\"endX\":580,\"endY\":300,\"width\":16,"
		"\"color1\":%lu,\"color2\":%lu}},"
		"\"calls\":{\"createDevice\":%u,\"browserBufferCreate\":%u,"
		"\"browserBufferUpdate\":%u,\"browserBufferRelease\":%u,"
		"\"setTexture\":%u,\"setTextureStageState\":%u,"
		"\"setStreamSource\":%u,\"setIndices\":%u,\"drawIndexed\":%u,"
		"\"setTransform\":%u,\"clear\":%u,\"present\":%u},"
		"\"draw\":{\"primitiveType\":%d,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"indexBufferId\":%u,"
		"\"indexFormat\":%d,\"transformMask\":%u,"
		"\"expectedLeft\":[241,0,14,255],"
		"\"expectedCenter\":[128,0,128,255],"
		"\"expectedRight\":[14,0,241,255],"
		"\"renderState\":{\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,"
		"\"colorArg2\":%lu,\"alphaOp\":%lu,\"alphaArg1\":%lu,"
		"\"alphaArg2\":%lu,\"texCoordIndex\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu,\"texCoordIndex\":%lu}]}}}",
		bool_json(ok),
		init_result,
		set_device_result,
		bool_json(display_allocated),
		bool_json(display_setup),
		begin_render_result,
		bool_json(draw_line_gradient_called),
		end_render_result,
		display != nullptr ? display->m_width : 0,
		display != nullptr ? display->m_height : 0,
		display != nullptr ? display->m_bitDepth : 0,
		bool_json(display != nullptr && display->m_windowed == TRUE),
		static_cast<unsigned long>(0xffff0000UL),
		static_cast<unsigned long>(0xff0000ffUL),
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->alpha_blend_enable : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->src_blend : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->dest_blend : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAOP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_TEXCOORDINDEX] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_TEXCOORDINDEX] : 0));

	g_ww3d_display_line_gradient_probe_json = buffer;
	return g_ww3d_display_line_gradient_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_openrect()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool display_allocated = false;
	bool display_setup = false;
	bool draw_open_rect_called = false;

	ProbeW3DDisplayStorage display_storage;
	W3DDisplay *display = nullptr;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		display = display_storage.prepare_for_2d_probe();
		display_allocated = display != nullptr;
		display_setup = display_allocated && display_storage.init_for_2d_probe(800, 600);
	}

	if (display_setup) {
		begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			display->W3DDisplay::drawOpenRect(300, 220, 200, 160, 8.0f, 0xffffff00UL);
			draw_open_rect_called = true;
			end_render_result = WW3D::End_Render(false);
		}
	}

	display_storage.release_probe_renderer();

	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		display_allocated &&
		display_setup &&
		succeeded(begin_render_result) &&
		draw_open_rect_called &&
		succeeded(end_render_result) &&
		state->create_device_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_texture_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 16 &&
		state->last_draw_primitive_count == 8 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		state->last_draw_index_format == D3DFMT_INDEX16 &&
		(state->last_draw_transform_mask & 7u) == 7u &&
		draw_state != nullptr &&
		draw_state->alpha_blend_enable == TRUE &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_SELECTARG2 &&
		stage0->values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	char buffer[4700];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_display_openrect_probe\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
		"\"displayAllocated\":%s,\"displaySetup\":%s,"
		"\"beginRender\":%d,\"drawOpenRectCalled\":%s,"
		"\"endRender\":%d},"
		"\"display\":{\"width\":%u,\"height\":%u,\"bitDepth\":%u,"
		"\"windowed\":%s,\"path\":\"W3DDisplay::drawOpenRect\","
		"\"rect\":{\"x\":300,\"y\":220,\"width\":200,\"height\":160},"
		"\"lineWidth\":8},"
		"\"calls\":{\"createDevice\":%u,\"browserBufferCreate\":%u,"
		"\"browserBufferUpdate\":%u,\"browserBufferRelease\":%u,"
		"\"setTexture\":%u,\"setTextureStageState\":%u,"
		"\"setStreamSource\":%u,\"setIndices\":%u,\"drawIndexed\":%u,"
		"\"setTransform\":%u,\"clear\":%u,\"present\":%u},"
		"\"draw\":{\"primitiveType\":%d,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"indexBufferId\":%u,"
		"\"indexFormat\":%d,\"transformMask\":%u,"
		"\"expectedBorder\":[255,255,0,255],"
		"\"expectedCenter\":[0,0,0,255],"
		"\"renderState\":{\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,"
		"\"colorArg2\":%lu,\"alphaOp\":%lu,\"alphaArg1\":%lu,"
		"\"alphaArg2\":%lu,\"texCoordIndex\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu,\"texCoordIndex\":%lu}]}}}",
		bool_json(ok),
		init_result,
		set_device_result,
		bool_json(display_allocated),
		bool_json(display_setup),
		begin_render_result,
		bool_json(draw_open_rect_called),
		end_render_result,
		display != nullptr ? display->m_width : 0,
		display != nullptr ? display->m_height : 0,
		display != nullptr ? display->m_bitDepth : 0,
		bool_json(display != nullptr && display->m_windowed == TRUE),
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->alpha_blend_enable : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->src_blend : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->dest_blend : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAOP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_TEXCOORDINDEX] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_TEXCOORDINDEX] : 0));

	g_ww3d_display_openrect_probe_json = buffer;
	return g_ww3d_display_openrect_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_rectclock()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool display_allocated = false;
	bool display_setup = false;
	bool draw_rect_clock_called = false;

	ProbeW3DDisplayStorage display_storage;
	W3DDisplay *display = nullptr;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		display = display_storage.prepare_for_2d_probe();
		display_allocated = display != nullptr;
		display_setup = display_allocated && display_storage.init_for_2d_probe(800, 600);
	}

	if (display_setup) {
		begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			display->W3DDisplay::drawRectClock(300, 220, 200, 160, 88, 0xff00ff00UL);
			draw_rect_clock_called = true;
			end_render_result = WW3D::End_Render(false);
		}
	}

	display_storage.release_probe_renderer();

	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		display_allocated &&
		display_setup &&
		succeeded(begin_render_result) &&
		draw_rect_clock_called &&
		succeeded(end_render_result) &&
		state->create_device_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_texture_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 14 &&
		state->last_draw_primitive_count == 6 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		state->last_draw_index_format == D3DFMT_INDEX16 &&
		(state->last_draw_transform_mask & 7u) == 7u &&
		draw_state != nullptr &&
		draw_state->alpha_blend_enable == TRUE &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_SELECTARG2 &&
		stage0->values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	char buffer[4700];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_display_rectclock_probe\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
		"\"displayAllocated\":%s,\"displaySetup\":%s,"
		"\"beginRender\":%d,\"drawRectClockCalled\":%s,"
		"\"endRender\":%d},"
		"\"display\":{\"width\":%u,\"height\":%u,\"bitDepth\":%u,"
		"\"windowed\":%s,\"path\":\"W3DDisplay::drawRectClock\","
		"\"clock\":{\"startX\":300,\"startY\":220,"
		"\"width\":200,\"height\":160,\"percent\":88}},"
		"\"calls\":{\"createDevice\":%u,\"browserBufferCreate\":%u,"
		"\"browserBufferUpdate\":%u,\"browserBufferRelease\":%u,"
		"\"setTexture\":%u,\"setTextureStageState\":%u,"
		"\"setStreamSource\":%u,\"setIndices\":%u,\"drawIndexed\":%u,"
		"\"setTransform\":%u,\"clear\":%u,\"present\":%u},"
		"\"draw\":{\"primitiveType\":%d,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"indexBufferId\":%u,"
		"\"indexFormat\":%d,\"transformMask\":%u,"
		"\"expectedFilled\":[0,255,0,255],"
		"\"expectedUnfilled\":[0,0,0,255],"
		"\"renderState\":{\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,"
		"\"colorArg2\":%lu,\"alphaOp\":%lu,\"alphaArg1\":%lu,"
		"\"alphaArg2\":%lu,\"texCoordIndex\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu,\"texCoordIndex\":%lu}]}}}",
		bool_json(ok),
		init_result,
		set_device_result,
		bool_json(display_allocated),
		bool_json(display_setup),
		begin_render_result,
		bool_json(draw_rect_clock_called),
		end_render_result,
		display != nullptr ? display->m_width : 0,
		display != nullptr ? display->m_height : 0,
		display != nullptr ? display->m_bitDepth : 0,
		bool_json(display != nullptr && display->m_windowed == TRUE),
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->alpha_blend_enable : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->src_blend : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->dest_blend : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAOP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_TEXCOORDINDEX] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_TEXCOORDINDEX] : 0));

	g_ww3d_display_rectclock_probe_json = buffer;
	return g_ww3d_display_rectclock_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_remaining_rectclock()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool display_allocated = false;
	bool display_setup = false;
	bool draw_remaining_rect_clock_called = false;

	ProbeW3DDisplayStorage display_storage;
	W3DDisplay *display = nullptr;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		display = display_storage.prepare_for_2d_probe();
		display_allocated = display != nullptr;
		display_setup = display_allocated && display_storage.init_for_2d_probe(800, 600);
	}

	if (display_setup) {
		begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			display->W3DDisplay::drawRemainingRectClock(300, 220, 200, 160, 50, 0xffff0000UL);
			draw_remaining_rect_clock_called = true;
			end_render_result = WW3D::End_Render(false);
		}
	}

	display_storage.release_probe_renderer();

	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		display_allocated &&
		display_setup &&
		succeeded(begin_render_result) &&
		draw_remaining_rect_clock_called &&
		succeeded(end_render_result) &&
		state->create_device_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_texture_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 10 &&
		state->last_draw_primitive_count == 4 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		state->last_draw_index_format == D3DFMT_INDEX16 &&
		(state->last_draw_transform_mask & 7u) == 7u &&
		draw_state != nullptr &&
		draw_state->alpha_blend_enable == TRUE &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_SELECTARG2 &&
		stage0->values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	char buffer[4800];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_display_remaining_rectclock_probe\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
		"\"displayAllocated\":%s,\"displaySetup\":%s,"
		"\"beginRender\":%d,\"drawRemainingRectClockCalled\":%s,"
		"\"endRender\":%d},"
		"\"display\":{\"width\":%u,\"height\":%u,\"bitDepth\":%u,"
		"\"windowed\":%s,\"path\":\"W3DDisplay::drawRemainingRectClock\","
		"\"clock\":{\"startX\":300,\"startY\":220,"
		"\"width\":200,\"height\":160,\"percent\":50}},"
		"\"calls\":{\"createDevice\":%u,\"browserBufferCreate\":%u,"
		"\"browserBufferUpdate\":%u,\"browserBufferRelease\":%u,"
		"\"setTexture\":%u,\"setTextureStageState\":%u,"
		"\"setStreamSource\":%u,\"setIndices\":%u,\"drawIndexed\":%u,"
		"\"setTransform\":%u,\"clear\":%u,\"present\":%u},"
		"\"draw\":{\"primitiveType\":%d,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"indexBufferId\":%u,"
		"\"indexFormat\":%d,\"transformMask\":%u,"
		"\"expectedFilled\":[255,0,0,255],"
		"\"expectedUnfilled\":[0,0,0,255],"
		"\"renderState\":{\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,"
		"\"colorArg2\":%lu,\"alphaOp\":%lu,\"alphaArg1\":%lu,"
		"\"alphaArg2\":%lu,\"texCoordIndex\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu,\"texCoordIndex\":%lu}]}}}",
		bool_json(ok),
		init_result,
		set_device_result,
		bool_json(display_allocated),
		bool_json(display_setup),
		begin_render_result,
		bool_json(draw_remaining_rect_clock_called),
		end_render_result,
		display != nullptr ? display->m_width : 0,
		display != nullptr ? display->m_height : 0,
		display != nullptr ? display->m_bitDepth : 0,
		bool_json(display != nullptr && display->m_windowed == TRUE),
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->alpha_blend_enable : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->src_blend : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->dest_blend : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAOP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_TEXCOORDINDEX] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_TEXCOORDINDEX] : 0));

	g_ww3d_display_remaining_rectclock_probe_json = buffer;
	return g_ww3d_display_remaining_rectclock_probe_json.c_str();
}

}
