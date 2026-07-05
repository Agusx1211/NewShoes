// Browser-owned WebBrowser boundary for direct cnc-port objects.
//
// The original WebBrowser implementation is an IE/ATL embedding boundary. Keep
// the browser substitute out of WebAssembly/shims/GameNetwork/... so engine-path
// includes can be audited for real-header resolution.

#pragma once

#ifndef __WEBBROWSER_H__
#define __WEBBROWSER_H__

#include "Common/AsciiString.h"
#include "Common/GameMemory.h"
#include "Common/GameType.h"
#include "Common/SubsystemInterface.h"

class GameWindow;
struct FieldParse;

class WebBrowserURL : public MemoryPoolObject
{
	MEMORY_POOL_GLUE_WITH_USERLOOKUP_CREATE(WebBrowserURL, "WebBrowserURL")

public:
	WebBrowserURL() : m_tag(), m_url(), m_next(nullptr) {}

	const FieldParse *getFieldParse() const { return nullptr; }

	AsciiString m_tag;
	AsciiString m_url;
	WebBrowserURL *m_next;
};

class WebBrowser : public SubsystemInterface
{
public:
	void init() override {}
	void reset() override {}
	void update() override {}

	virtual Bool createBrowserWindow(char *, GameWindow *) { return FALSE; }
	virtual void closeBrowserWindow(GameWindow *) {}

	WebBrowserURL *makeNewURL(AsciiString) { return nullptr; }
	WebBrowserURL *findURL(AsciiString) { return nullptr; }

	void *m_dispatch = nullptr;
};

extern WebBrowser *TheWebBrowser;

#endif // __WEBBROWSER_H__
