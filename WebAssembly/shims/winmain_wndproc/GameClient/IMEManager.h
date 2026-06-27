#pragma once

#include <windows.h>
#include "Common/GameType.h"

class IMEManagerInterface
{
public:
	Bool serviceIMEMessage(HWND, UINT, WPARAM, LPARAM) { return FALSE; }
	LRESULT result() const { return 0; }
};

extern IMEManagerInterface *TheIMEManager;
