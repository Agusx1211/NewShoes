#include "wasm_prerts_real.h"

#include "Common/GlobalData.h"
#include "Common/INI.h"
#include "GameClient/Display.h"
#include "GameClient/DisplayStringManager.h"
#include "GameClient/GameFont.h"
#include "GameClient/GlobalLanguage.h"
#include "GameClient/IMEManager.h"
#include "GameClient/Image.h"
#include "GameClient/Keyboard.h"

Display *TheDisplay = nullptr;
DisplayStringManager *TheDisplayStringManager = nullptr;
FontLibrary *TheFontLibrary = nullptr;
GlobalLanguage *TheGlobalLanguageData = nullptr;
GlobalData *TheWritableGlobalData = nullptr;
IMEManagerInterface *TheIMEManager = nullptr;
ImageCollection *TheMappedImageCollection = nullptr;
Keyboard *TheKeyboard = nullptr;

INI::INI()
{
}

INI::~INI()
{
}

void INI::load(AsciiString, INILoadType, Xfer *)
{
}

Display::Display()
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
	m_letterBoxFadeLevel = 0;
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

Display::~Display()
{
	stopMovie();
	deleteViews();
}

void Display::deleteViews()
{
	View *next = nullptr;

	for (View *view = m_viewList; view != nullptr; view = next) {
		next = view->getNextView();
		delete view;
	}

	m_viewList = nullptr;
}

void Display::attachView(View *view)
{
	m_viewList = view->prependViewToList(m_viewList);
}

void Display::drawViews()
{
	for (View *view = m_viewList; view != nullptr; view = view->getNextView()) {
		view->drawView();
	}
}

void Display::updateViews()
{
	for (View *view = m_viewList; view != nullptr; view = view->getNextView()) {
		view->updateView();
	}
}

void Display::draw()
{
	drawViews();
}

Bool Display::setDisplayMode(UnsignedInt xres, UnsignedInt yres, UnsignedInt bitdepth, Bool windowed)
{
	setWidth(xres);
	setHeight(yres);
	setBitDepth(bitdepth);
	setWindowed(windowed);
	return TRUE;
}

void Display::setWidth(UnsignedInt width)
{
	m_width = width;
}

void Display::setHeight(UnsignedInt height)
{
	m_height = height;
}

void Display::playLogoMovie(AsciiString, Int, Int)
{
	stopMovie();
}

void Display::playMovie(AsciiString)
{
	stopMovie();
}

void Display::stopMovie()
{
	m_videoBuffer = nullptr;
	m_videoStream = nullptr;
	m_currentlyPlayingMovie = AsciiString::TheEmptyString;
	m_copyrightDisplayString = nullptr;
	m_copyrightHoldTime = -1;
	m_movieHoldTime = -1;
}

void Display::update()
{
}

void Display::reset()
{
	m_letterBoxFadeLevel = 0;
	m_letterBoxEnabled = FALSE;
	stopMovie();

	for (View *view = m_viewList; view != nullptr; view = view->getNextView()) {
		view->reset();
	}
}

Bool Display::isMoviePlaying()
{
	return m_videoStream != nullptr && m_videoBuffer != nullptr;
}

void Display::setDebugDisplayCallback(DebugDisplayCallback *callback, void *userData)
{
	m_debugDisplayCallback = callback;
	m_debugDisplayUserData = userData;
}

Display::DebugDisplayCallback *Display::getDebugDisplayCallback()
{
	return m_debugDisplayCallback;
}

FontLibrary::FontLibrary()
{
	m_fontList = nullptr;
	m_count = 0;
}

FontLibrary::~FontLibrary()
{
	deleteAllFonts();
}

void FontLibrary::init()
{
}

void FontLibrary::reset()
{
	deleteAllFonts();
}

void FontLibrary::linkFont(GameFont *font)
{
	if (font == nullptr) {
		return;
	}

	font->next = m_fontList;
	m_fontList = font;
	m_count++;
}

void FontLibrary::unlinkFont(GameFont *font)
{
	if (font == nullptr) {
		return;
	}

	if (font == m_fontList) {
		m_fontList = font->next;
	} else {
		GameFont *previous = m_fontList;
		while (previous != nullptr && previous->next != font) {
			previous = previous->next;
		}
		if (previous == nullptr) {
			return;
		}
		previous->next = font->next;
	}

	font->next = nullptr;
	m_count--;
}

void FontLibrary::deleteAllFonts()
{
	while (m_fontList != nullptr) {
		GameFont *font = m_fontList;
		unlinkFont(font);
		releaseFontData(font);
		font->deleteInstance();
	}
}

GameFont *FontLibrary::getFont(AsciiString name, Int pointSize, Bool bold)
{
	for (GameFont *font = m_fontList; font != nullptr; font = font->next) {
		if (font->pointSize == pointSize && font->bold == bold && font->nameString == name) {
			return font;
		}
	}

	GameFont *font = newInstance(GameFont);
	if (font == nullptr) {
		return nullptr;
	}

	font->next = nullptr;
	font->nameString = name;
	font->pointSize = pointSize;
	font->height = 0;
	font->fontData = nullptr;
	font->bold = bold;

	if (loadFontData(font) == FALSE) {
		font->deleteInstance();
		return nullptr;
	}

	linkFont(font);
	return font;
}

ImageCollection::ImageCollection()
{
}

ImageCollection::~ImageCollection()
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
