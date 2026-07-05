// Shared declaration of BrowserWin32Mouse and browser_mouse() so that
// wasm_real_engine_init.cpp can call browser_mouse() to wire TheWin32Mouse
// in the real-engine-init path.

#pragma once

#include "Win32Device/GameClient/Win32Mouse.h"

// cursorResources is defined in WinMain.cpp; declared extern here so
// BrowserWin32Mouse::ensureArrowCursorResource() can reference it.
extern HCURSOR cursorResources[Mouse::NUM_MOUSE_CURSORS][MAX_2D_CURSOR_DIRECTIONS];

class BrowserWin32Mouse : public Win32Mouse
{
public:
	using Win32Mouse::getMouseEvent;

	bool isLostFocus() const { return m_lostFocus; }
	bool isVisibleForProbe() const { return m_visible; }
	MouseCursor currentWin32Cursor() const { return m_currentWin32Cursor; }
	Int eventsThisFrameForProbe() const { return m_eventsThisFrame; }
	UnsignedInt inputFrameForProbe() const { return m_inputFrame; }

	void ensureArrowCursorResource()
	{
		cursorResources[Mouse::ARROW][0] = LoadCursor(nullptr, "arrow");
	}

	void prepareStreamProbe(int width, int height)
	{
		std::memset(m_eventBuffer, 0, sizeof(m_eventBuffer));
		m_nextFreeIndex = 0;
		m_nextGetIndex = 0;
		std::memset(m_mouseEvents, 0, sizeof(m_mouseEvents));
		std::memset(&m_currMouse, 0, sizeof(m_currMouse));
		std::memset(&m_prevMouse, 0, sizeof(m_prevMouse));
		m_minX = 0;
		m_minY = 0;
		m_maxX = width > 0 ? width - 1 : 799;
		m_maxY = height > 0 ? height - 1 : 599;
		m_inputFrame = 0;
		m_deadInputFrame = 0;
		m_eventsThisFrame = 0;
		m_inputMovesAbsolute = TRUE;
	}
};

// Lazy singleton accessor — defined in wasm_wndproc_probe.cpp.
extern BrowserWin32Mouse &browser_mouse();
