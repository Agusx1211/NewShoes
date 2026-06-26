#pragma once

#ifndef __WEBBROWSER_H__
#define __WEBBROWSER_H__

#include "Common/SubsystemInterface.h"
#include "Common/GameMemory.h"
#include "Common/AsciiString.h"
#include "Common/GameType.h"

class GameWindow;
struct FieldParse;

class WebBrowserURL : public MemoryPoolObject
{
	MEMORY_POOL_GLUE_WITH_USERLOOKUP_CREATE(WebBrowserURL, "WebBrowserURL")

public:
	WebBrowserURL() : m_tag(), m_url(), m_next(nullptr) {}

	const FieldParse *getFieldParse(void) const { return nullptr; }

	AsciiString m_tag;
	AsciiString m_url;
	WebBrowserURL *m_next;
};

class WebBrowser : public SubsystemInterface
{
public:
	void init(void) override {}
	void reset(void) override {}
	void update(void) override {}

	virtual Bool createBrowserWindow(char *, GameWindow *) { return FALSE; }
	virtual void closeBrowserWindow(GameWindow *) {}

	WebBrowserURL *makeNewURL(AsciiString) { return nullptr; }
	WebBrowserURL *findURL(AsciiString) { return nullptr; }

	void *m_dispatch = nullptr;
};

extern WebBrowser *TheWebBrowser;

#endif // __WEBBROWSER_H__
