#pragma once

#include "windows.h"

#ifndef _INC_WINDOWSX
#define _INC_WINDOWSX
#endif

#ifndef GlobalAllocPtr
#define GlobalAllocPtr(flags, bytes) GlobalAlloc((flags), (bytes))
#endif

#ifndef GlobalFreePtr
#define GlobalFreePtr(pointer) GlobalFree((pointer))
#endif

static inline BOOL SetRect(RECT *rect, int left, int top, int right, int bottom)
{
	if (rect == nullptr) {
		return FALSE;
	}
	rect->left = left;
	rect->top = top;
	rect->right = right;
	rect->bottom = bottom;
	return TRUE;
}
