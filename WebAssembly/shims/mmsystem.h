#pragma once

#include "windows.h"

using MMRESULT = unsigned int;
using UINT = unsigned int;

#ifndef TIMERR_NOERROR
#define TIMERR_NOERROR 0
#endif

struct TIMECAPS
{
	UINT wPeriodMin;
	UINT wPeriodMax;
};

static inline DWORD timeGetTime()
{
	return static_cast<DWORD>(Win32PortNowMilliseconds());
}

static inline MMRESULT timeBeginPeriod(UINT)
{
	return TIMERR_NOERROR;
}

static inline MMRESULT timeEndPeriod(UINT)
{
	return TIMERR_NOERROR;
}

static inline MMRESULT timeGetDevCaps(TIMECAPS *caps, UINT)
{
	if (caps != nullptr) {
		caps->wPeriodMin = 1;
		caps->wPeriodMax = 1000;
	}
	return TIMERR_NOERROR;
}
