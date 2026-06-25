#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cwchar>
#include <string>
#include <vector>

#include "PreRTS.h"

#include "Common/File.h"
#include "Common/FileSystem.h"
#include "Common/GlobalData.h"
#include "Common/LocalFileSystem.h"
#include "Common/SubsystemInterface.h"
#include "GameClient/Color.h"
#include "GameClient/DebugDisplay.h"
#include "GameClient/DrawGroupInfo.h"
#include "GameClient/GlobalLanguage.h"
#include "GameClient/LanguageFilter.h"
#include "GameClient/Line2D.h"
#include "GameClient/ParabolicEase.h"
#include "GameClient/Snow.h"
#include "GameClient/Statistics.h"
#include "GameClient/VideoPlayer.h"

SubsystemInterfaceList *TheSubsystemList = nullptr;
GlobalData *TheGlobalData = nullptr;

namespace {
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
	explicit SmokeLocalFileSystem(const std::vector<char> &payload) : m_payload(payload) {}

	void init() override {}
	void reset() override {}
	void update() override {}

	File *openFile(const Char *filename, Int access = 0) override
	{
		if (filename == nullptr || std::strcmp(filename, BadWordFileName) != 0) {
			return nullptr;
		}

		m_file.close();
		m_file.setPayload(m_payload);
		return m_file.open(filename, access) ? &m_file : nullptr;
	}

	Bool doesFileExist(const Char *filename) const override
	{
		return filename != nullptr && std::strcmp(filename, BadWordFileName) == 0;
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
	const std::vector<char> &m_payload;
	SmokeFile m_file;
};

class SmokeLanguageFilter : public LanguageFilter
{
public:
	using LanguageFilter::readWord;
	using LanguageFilter::unHaxor;

	Int wordCount() const { return static_cast<Int>(m_wordList.size()); }
};

class SmokeSnowManager : public SnowManager
{
public:
	void update() override {}

	Real velocity() const { return m_velocity; }
	Real frequencyScaleX() const { return m_frequencyScaleX; }
	Real frequencyScaleY() const { return m_frequencyScaleY; }
	Real amplitude() const { return m_amplitude; }
	Real pointSize() const { return m_pointSize; }
	Real quadSize() const { return m_quadSize; }
	Real boxDimensions() const { return m_boxDimensions; }
	Real emitterSpacing() const { return m_emitterSpacing; }
	Real fullTimePeriod() const { return m_fullTimePeriod; }
	Bool isVisible() const { return m_isVisible; }
};

class SmokeDebugDisplay : public DebugDisplay
{
public:
	struct DrawCall
	{
		Int x;
		Int y;
		std::string text;
	};

	const std::vector<DrawCall> &drawCalls() const { return m_drawCalls; }
	Color textColor() const { return m_textColor; }
	Int rightMargin() const { return m_rightMargin; }
	Int leftMargin() const { return m_leftMargin; }

protected:
	void drawText(Int x, Int y, Char *text) override
	{
		m_drawCalls.push_back({ x, y, text != nullptr ? text : "" });
	}

private:
	std::vector<DrawCall> m_drawCalls;
};

class SmokeVideoBuffer : public VideoBuffer
{
public:
	explicit SmokeVideoBuffer(Type format) : VideoBuffer(format), m_storage(), m_locked(false) {}

	Bool allocate(UnsignedInt width, UnsignedInt height) override
	{
		m_width = width;
		m_height = height;
		m_textureWidth = width * 2;
		m_textureHeight = height * 2;
		m_pitch = width * 4;
		m_storage.resize(static_cast<std::size_t>(m_pitch * height));
		return TRUE;
	}

	void free() override
	{
		VideoBuffer::free();
		m_pitch = 0;
		m_storage.clear();
		m_locked = false;
	}

	void *lock() override
	{
		m_locked = true;
		return m_storage.empty() ? nullptr : m_storage.data();
	}

	void unlock() override { m_locked = false; }
	Bool valid() override { return !m_storage.empty(); }
	Bool locked() const { return m_locked; }

private:
	std::vector<unsigned char> m_storage;
	Bool m_locked;
};

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::fprintf(stderr, "%s\n", message);
	}
	return condition;
}

bool near(Real actual, Real expected, Real epsilon = 0.0001f)
{
	return std::fabs(actual - expected) <= epsilon;
}

bool expect_font_desc(
	const FontDesc &font,
	const char *name,
	Int size,
	Bool bold,
	const char *message)
{
	return expect(std::strcmp(font.name.str(), name) == 0 && font.size == size && font.bold == bold, message);
}

void append_u16le(std::vector<char> &buffer, UnsignedShort value)
{
	buffer.push_back(static_cast<char>(value & 0xff));
	buffer.push_back(static_cast<char>((value >> 8) & 0xff));
}

void append_language_word(std::vector<char> &buffer, const WideChar *word, Bool encoded)
{
	for (Int i = 0; word[i] != 0; ++i) {
		UnsignedShort code_unit = static_cast<UnsignedShort>(word[i] & 0xffff);
		if (encoded) {
			code_unit = static_cast<UnsignedShort>(code_unit ^ LANGUAGE_XOR_KEY);
		}
		append_u16le(buffer, code_unit);
	}
	append_u16le(buffer, static_cast<UnsignedShort>(L' '));
}

bool exercise_color()
{
	const Color color = GameMakeColor(80, 120, 160, 200);
	UnsignedByte red = 0;
	UnsignedByte green = 0;
	UnsignedByte blue = 0;
	UnsignedByte alpha = 0;
	GameGetColorComponents(color, &red, &green, &blue, &alpha);

	Real red_real = 0.0f;
	Real green_real = 0.0f;
	Real blue_real = 0.0f;
	Real alpha_real = 0.0f;
	GameGetColorComponentsReal(color, &red_real, &green_real, &blue_real, &alpha_real);

	const Color darkened = GameDarkenColor(color, 25);
	UnsignedByte dark_red = 0;
	UnsignedByte dark_green = 0;
	UnsignedByte dark_blue = 0;
	UnsignedByte dark_alpha = 0;
	GameGetColorComponents(darkened, &dark_red, &dark_green, &dark_blue, &dark_alpha);

	return expect(color == static_cast<Color>(0xc85078a0), "GameMakeColor packing failed") &&
		expect(red == 80 && green == 120 && blue == 160 && alpha == 200,
			"GameGetColorComponents unpack failed") &&
		expect(near(red_real, 80.0f / 255.0f) &&
				near(green_real, 120.0f / 255.0f) &&
				near(blue_real, 160.0f / 255.0f) &&
				near(alpha_real, 200.0f / 255.0f),
			"GameGetColorComponentsReal unpack failed") &&
		expect(dark_red == 60 && dark_green == 90 && dark_blue == 120 && dark_alpha == 200,
			"GameDarkenColor failed");
}

bool exercise_line2d()
{
	IRegion2D clip = { { 0, 0 }, { 10, 10 } };
	ICoord2D p1 = { -5, 5 };
	ICoord2D p2 = { 15, 5 };
	ICoord2D c1 = { 0, 0 };
	ICoord2D c2 = { 0, 0 };
	if (!expect(ClipLine2D(&p1, &p2, &c1, &c2, &clip), "ClipLine2D rejected visible line")) {
		return false;
	}
	if (!expect(c1.x == 0 && c1.y == 5 && c2.x == 10 && c2.y == 5,
			"ClipLine2D endpoints failed")) {
		return false;
	}

	ICoord2D outside1 = { -5, -5 };
	ICoord2D outside2 = { -1, -1 };
	if (!expect(!ClipLine2D(&outside1, &outside2, &c1, &c2, &clip),
			"ClipLine2D accepted invisible line")) {
		return false;
	}

	Coord2D a = { 0.0f, 0.0f };
	Coord2D b = { 10.0f, 10.0f };
	Coord2D c = { 0.0f, 10.0f };
	Coord2D d = { 10.0f, 0.0f };
	Coord2D intersection = { 0.0f, 0.0f };
	if (!expect(IntersectLine2D(&a, &b, &c, &d, &intersection) &&
			near(intersection.x, 5.0f) && near(intersection.y, 5.0f),
			"IntersectLine2D failed")) {
		return false;
	}

	Coord2D square[] = {
		{ 0.0f, 0.0f },
		{ 4.0f, 0.0f },
		{ 4.0f, 4.0f },
		{ 0.0f, 4.0f },
	};
	Coord2D inside = { 1.0f, 2.0f };
	Coord2D outside = { 5.0f, 2.0f };
	if (!expect(PointInsideArea2D(&inside, square, 4) &&
			!PointInsideArea2D(&outside, square, 4),
			"PointInsideArea2D failed")) {
		return false;
	}

	Coord2D top_left = { 0.0f, 0.0f };
	Coord2D bottom_right = { 10.0f, 10.0f };
	ScaleRect2D(&top_left, &bottom_right, 1.5f);
	return expect(near(top_left.x, -2.5f) && near(top_left.y, -2.5f) &&
			near(bottom_right.x, 12.5f) && near(bottom_right.y, 12.5f),
		"ScaleRect2D failed");
}

bool exercise_parabolic_ease()
{
	ParabolicEase linear;
	ParabolicEase eased(0.25f, 0.25f);

	return expect(near(linear(0.5f), 0.5f), "default ParabolicEase midpoint failed") &&
		expect(near(eased(0.0f), 0.0f) &&
				near(eased(0.5f), 0.5f) &&
				near(eased(1.0f), 1.0f),
			"ParabolicEase endpoint/midpoint failed") &&
		expect(eased(0.125f) < 0.125f && eased(0.875f) > 0.875f,
			"ParabolicEase curve shape failed");
}

bool exercise_statistics()
{
	return expect(near(Normalize(5.0f, 0.0f, 10.0f), 0.5f),
			"Normalize failed") &&
		expect(near(NormalizeToRange(5.0f, 0.0f, 10.0f, -1.0f, 1.0f), 0.0f),
			"NormalizeToRange failed") &&
		expect(near(MuLaw(5.0f, 10.0f, 255.0f), 0.0f) &&
				near(MuLaw(10.0f, 10.0f, 255.0f), 1.0f) &&
				near(MuLaw(0.0f, 10.0f, 255.0f), -1.0f),
			"MuLaw failed");
}

bool exercise_draw_group_info()
{
	DrawGroupInfo info;
	UnsignedByte text_red = 0;
	UnsignedByte text_green = 0;
	UnsignedByte text_blue = 0;
	UnsignedByte text_alpha = 0;
	GameGetColorComponents(info.m_colorForText, &text_red, &text_green, &text_blue, &text_alpha);

	UnsignedByte shadow_red = 0;
	UnsignedByte shadow_green = 0;
	UnsignedByte shadow_blue = 0;
	UnsignedByte shadow_alpha = 0;
	GameGetColorComponents(
		info.m_colorForTextDropShadow,
		&shadow_red,
		&shadow_green,
		&shadow_blue,
		&shadow_alpha);

	return expect(std::strcmp(info.m_fontName.str(), "Arial") == 0 && info.m_fontSize == 10 &&
				info.m_fontIsBold == FALSE,
			"DrawGroupInfo font defaults failed") &&
		expect(info.m_usePlayerColor == TRUE &&
				text_red == 255 && text_green == 255 && text_blue == 255 && text_alpha == 255 &&
				shadow_red == 0 && shadow_green == 0 && shadow_blue == 0 && shadow_alpha == 255,
			"DrawGroupInfo color defaults failed") &&
		expect(info.m_dropShadowOffsetX == -1 && info.m_dropShadowOffsetY == -1,
			"DrawGroupInfo shadow offsets failed") &&
		expect(info.m_usingPixelOffsetX == FALSE && near(info.m_percentOffsetX, -0.05f) &&
				info.m_usingPixelOffsetY == TRUE && info.m_pixelOffsetY == -10,
			"DrawGroupInfo position offsets failed");
}

bool exercise_global_language()
{
	GlobalData global_data;
	TheGlobalData = &global_data;

	GlobalLanguage language;
	const bool defaults_ok = expect(language.m_unicodeFontName.isEmpty(), "GlobalLanguage unicode font default failed") &&
		expect(language.m_unicodeFontFileName.isEmpty(), "GlobalLanguage unicode font filename default failed") &&
		expect(language.m_militaryCaptionSpeed == 0 && language.m_militaryCaptionDelayMS == 750 &&
				language.m_useHardWrap == FALSE && near(language.m_resolutionFontSizeAdjustment, 0.7f),
			"GlobalLanguage scalar defaults failed") &&
		expect_font_desc(language.m_messageFont, "Arial Unicode MS", 12, FALSE,
			"GlobalLanguage FontDesc defaults failed");

	global_data.m_xResolution = 800;
	const bool base_ok = expect(language.adjustFontSize(10) == 10, "GlobalLanguage base font scaling failed");
	global_data.m_xResolution = 1600;
	const bool high_ok = expect(language.adjustFontSize(10) == 17, "GlobalLanguage high font scaling failed");
	global_data.m_xResolution = 3200;
	const bool clamp_high_ok = expect(language.adjustFontSize(10) == 20,
		"GlobalLanguage high font scaling clamp failed");
	global_data.m_xResolution = 400;
	const bool clamp_low_ok = expect(language.adjustFontSize(10) == 10,
		"GlobalLanguage low font scaling clamp failed");

	TheGlobalData = nullptr;
	return defaults_ok && base_ok && high_ok && clamp_high_ok && clamp_low_ok;
}

bool exercise_language_filter()
{
	SmokeLanguageFilter filter;

	std::vector<char> raw_words;
	append_language_word(raw_words, L"bad", FALSE);
	SmokeFile raw_word_file;
	raw_word_file.setPayload(raw_words);
	raw_word_file.open("words", File::READ | File::BINARY);

	UnsignedShort raw_word[8] = {};
	const bool read_ok = expect(filter.readWord(&raw_word_file, raw_word, ELEMENTS_OF(raw_word)),
			"LanguageFilter readWord rejected delimited UTF-16 word") &&
		expect(raw_word[0] == L'b' && raw_word[1] == L'a' && raw_word[2] == L'd' && raw_word[3] == 0,
			"LanguageFilter readWord UTF-16 units failed");
	raw_word_file.close();

	UnicodeString haxored(L"pH4$3");
	filter.unHaxor(haxored);
	const bool unhaxor_ok = expect(std::wcscmp(haxored.str(), L"fase") == 0,
		"LanguageFilter unHaxor normalization failed");

	std::vector<char> encoded_words;
	append_language_word(encoded_words, L"b-a_d", TRUE);
	SmokeLocalFileSystem local_file_system(encoded_words);
	FileSystem file_system;
	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	TheFileSystem = &file_system;
	TheLocalFileSystem = &local_file_system;

	SmokeLanguageFilter initialized_filter;
	initialized_filter.init();
	UnicodeString line(L"ok b-a_d pass");
	initialized_filter.filterLine(line);

	TheLocalFileSystem = old_local_file_system;
	TheFileSystem = old_file_system;

	return read_ok &&
		unhaxor_ok &&
		expect(initialized_filter.wordCount() == 1, "LanguageFilter init did not load encoded word") &&
		expect(std::wcscmp(line.str(), L"ok ***** pass") == 0, "LanguageFilter filterLine failed");
}

bool exercise_snow()
{
	WeatherSetting *weather = newInstance(WeatherSetting);
	OVERRIDE<WeatherSetting> old_weather_setting = TheWeatherSetting;
	TheWeatherSetting = weather;

	const bool defaults_ok =
		expect(std::strcmp(weather->m_snowTexture.str(), "EXSnowFlake.tga") == 0,
			"WeatherSetting snow texture default failed") &&
		expect(near(weather->m_snowFrequencyScaleX, 0.0533f) &&
				near(weather->m_snowFrequencyScaleY, 0.0275f) &&
				near(weather->m_snowAmplitude, 5.0f),
			"WeatherSetting snow motion defaults failed") &&
		expect(near(weather->m_snowPointSize, 1.0f) &&
				near(weather->m_snowQuadSize, 0.5f) &&
				near(weather->m_snowBoxDimensions, 200.0f) &&
				near(weather->m_snowBoxDensity, 1.0f) &&
				near(weather->m_snowVelocity, 4.0f),
			"WeatherSetting snow geometry defaults failed") &&
		expect(weather->m_usePointSprites == TRUE && weather->m_snowEnabled == FALSE &&
				near(weather->m_snowMaxPointSize, 64.0f) &&
				near(weather->m_snowMinPointSize, 0.0f),
			"WeatherSetting snow flag defaults failed") &&
		expect(weather->getFieldParse()[0].token != nullptr, "WeatherSetting parse table missing");

	SmokeSnowManager manager;
	std::srand(1);
	manager.init();
	const bool manager_ok =
		expect(near(manager.velocity(), weather->m_snowVelocity) &&
				near(manager.frequencyScaleX(), weather->m_snowFrequencyScaleX) &&
				near(manager.frequencyScaleY(), weather->m_snowFrequencyScaleY) &&
				near(manager.amplitude(), weather->m_snowAmplitude),
			"SnowManager copied motion settings failed") &&
		expect(near(manager.pointSize(), weather->m_snowPointSize) &&
				near(manager.quadSize(), weather->m_snowQuadSize) &&
				near(manager.boxDimensions(), weather->m_snowBoxDimensions) &&
				near(manager.emitterSpacing(), 1.0f / weather->m_snowBoxDensity) &&
				near(manager.fullTimePeriod(), weather->m_snowBoxDimensions / weather->m_snowVelocity),
			"SnowManager copied geometry settings failed") &&
		expect(manager.isVisible() == TRUE, "SnowManager visibility default failed");

	manager.setVisible(FALSE);
	const bool visibility_ok = expect(manager.isVisible() == FALSE, "SnowManager setVisible failed");
	manager.reset();
	const bool reset_ok = expect(manager.isVisible() == TRUE, "SnowManager reset visibility failed");

	TheWeatherSetting = old_weather_setting;
	weather->deleteInstance();

	return defaults_ok && manager_ok && visibility_ok && reset_ok;
}

bool exercise_debug_display()
{
	SmokeDebugDisplay display;
	const bool defaults_ok =
		expect(display.getCursorXPos() == 0 && display.getCursorYPos() == 0,
			"DebugDisplay cursor defaults failed") &&
		expect(display.getWidth() == 0 && display.getHeight() == 0,
			"DebugDisplay size defaults failed") &&
		expect(display.textColor() == DebugDisplayInterface::WHITE &&
				display.rightMargin() == 0 && display.leftMargin() == 0,
			"DebugDisplay reset defaults failed");

	display.setCursorPos(2, 3);
	display.setRightMargin(4);
	display.setLeftMargin(20);
	display.setTextColor(DebugDisplayInterface::GREEN);
	Char format[] = "alpha %d\nbeta";
	display.printf(format, 7);
	const std::vector<SmokeDebugDisplay::DrawCall> &draws = display.drawCalls();

	return defaults_ok &&
		expect(display.textColor() == DebugDisplayInterface::GREEN &&
				display.rightMargin() == 4 && display.leftMargin() == 20,
			"DebugDisplay setters failed") &&
		expect(draws.size() == 2, "DebugDisplay line splitting failed") &&
		expect(draws[0].x == 6 && draws[0].y == 3 && draws[0].text == "alpha 7",
			"DebugDisplay first draw failed") &&
		expect(draws[1].x == 4 && draws[1].y == 4 && draws[1].text == "beta",
			"DebugDisplay second draw failed") &&
		expect(display.getCursorXPos() == 4 && display.getCursorYPos() == 4,
			"DebugDisplay cursor advance failed");
}

bool exercise_video_player()
{
	SmokeVideoBuffer buffer(VideoBuffer::TYPE_X8R8G8B8);
	const bool buffer_ok =
		expect(buffer.allocate(320, 200), "VideoBuffer allocate failed") &&
		expect(buffer.width() == 320 && buffer.height() == 200 &&
				buffer.textureWidth() == 640 && buffer.textureHeight() == 400 &&
				buffer.pitch() == 1280,
			"VideoBuffer dimensions failed") &&
		expect(buffer.lock() != nullptr && buffer.locked(), "VideoBuffer lock failed");
	buffer.unlock();
	RectClass rect = buffer.Rect(0.25f, 0.5f, 1.0f, 1.0f);
	const bool rect_ok = expect(near(rect.Left, 0.125f) && near(rect.Top, 0.25f) &&
			near(rect.Right, 0.5f) && near(rect.Bottom, 0.5f),
		"VideoBuffer scaled rect failed");
	buffer.free();
	const bool free_ok = expect(!buffer.valid() && buffer.width() == 0 && buffer.height() == 0,
		"VideoBuffer free failed");

	VideoPlayer player;
	VideoPlayerInterface *old_video_player = TheVideoPlayer;
	TheVideoPlayer = &player;
	player.init();
	Video intro;
	intro.m_filename = "Data\\Movies\\Intro.bik";
	intro.m_internalName = "Intro";
	intro.m_commentForWB = "first";
	player.addVideo(&intro);

	Video replacement = intro;
	replacement.m_filename = "Data\\Movies\\IntroReplacement.bik";
	replacement.m_commentForWB = "replacement";
	player.addVideo(&replacement);

	Video shell;
	shell.m_filename = "Data\\Movies\\Shell.bik";
	shell.m_internalName = "Shell";
	player.addVideo(&shell);

	const Video *intro_lookup = player.getVideo(AsciiString("Intro"));
	const Video *index_lookup = player.getVideo(1);
	const bool list_ok =
		expect(player.getNumVideos() == 2, "VideoPlayer add/replace failed") &&
		expect(intro_lookup != nullptr &&
				intro_lookup->m_filename == AsciiString("Data\\Movies\\IntroReplacement.bik") &&
				intro_lookup->m_commentForWB == AsciiString("replacement"),
			"VideoPlayer replacement lookup failed") &&
		expect(index_lookup != nullptr && index_lookup->m_internalName == AsciiString("Shell"),
			"VideoPlayer index lookup failed") &&
		expect(player.getVideo(2) == nullptr && player.getVideo(AsciiString("Missing")) == nullptr,
			"VideoPlayer missing lookup failed") &&
		expect(player.firstStream() == nullptr && player.open(AsciiString("Intro")) == nullptr &&
				player.load(AsciiString("Intro")) == nullptr,
			"VideoPlayer provider-null defaults failed");

	player.removeVideo(&replacement);
	const bool remove_ok = expect(player.getNumVideos() == 1 && player.getVideo(AsciiString("Intro")) == nullptr,
		"VideoPlayer remove failed");
	player.reset();
	TheVideoPlayer = old_video_player;

	return buffer_ok && rect_ok && free_ok && list_ok && remove_ok;
}
}

int main()
{
	const bool ok = exercise_color() &&
		exercise_line2d() &&
		exercise_parabolic_ease() &&
		exercise_statistics() &&
		exercise_draw_group_info() &&
		exercise_global_language() &&
		exercise_language_filter() &&
		exercise_snow() &&
		exercise_debug_display() &&
		exercise_video_player();

	if (!ok) {
		return 1;
	}

	std::printf("{\"ok\":true,\"library\":\"GameClient/utility\","
		"\"compiled\":\"Color,DebugDisplay,DrawGroupInfo,GlobalLanguage,LanguageFilter,Line2D,ParabolicEase,Snow,Statistics,VideoPlayer,VideoStream\","
		"\"source\":\"GeneralsMD original\"}\n");
	return 0;
}
