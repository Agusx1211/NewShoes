#pragma once

#include <cstdint>

#include "windows.h"

using S8 = std::int8_t;
using U8 = std::uint8_t;
using S16 = std::int16_t;
using U16 = std::uint16_t;
using S32 = std::int32_t;
using U32 = std::uint32_t;
using F32 = float;
using C8 = char;

using HDIGDRIVER = void *;
using HPROVIDER = void *;
using HSAMPLE = void *;
using H3DSAMPLE = void *;
using H3DPOBJECT = void *;
using HSTREAM = void *;
using HTIMER = void *;

struct WAVEFORMAT
{
	WORD wFormatTag;
	WORD nChannels;
	DWORD nSamplesPerSec;
	DWORD nAvgBytesPerSec;
	WORD nBlockAlign;
};

using LPWAVEFORMAT = WAVEFORMAT *;

#ifndef AILCALLBACK
#define AILCALLBACK
#endif

#ifndef DP_FILTER
#define DP_FILTER 0
#endif
