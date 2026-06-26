#pragma once

#include "windows.h"

struct IDirectSound;
using LPDIRECTSOUND = IDirectSound *;

#ifndef DSSPEAKER_DIRECTOUT
#define DSSPEAKER_DIRECTOUT 0
#endif

#ifndef DSSPEAKER_HEADPHONE
#define DSSPEAKER_HEADPHONE 1
#endif

#ifndef DSSPEAKER_MONO
#define DSSPEAKER_MONO 2
#endif

#ifndef DSSPEAKER_QUAD
#define DSSPEAKER_QUAD 3
#endif

#ifndef DSSPEAKER_STEREO
#define DSSPEAKER_STEREO 4
#endif

#ifndef DSSPEAKER_SURROUND
#define DSSPEAKER_SURROUND 5
#endif

#ifndef DSSPEAKER_5POINT1
#define DSSPEAKER_5POINT1 6
#endif

#ifndef DSSPEAKER_7POINT1
#define DSSPEAKER_7POINT1 7
#endif

#ifndef DSSPEAKER_CONFIG
#define DSSPEAKER_CONFIG(value) (static_cast<DWORD>(value) & 0xffUL)
#endif

struct IDirectSound
{
	HRESULT GetSpeakerConfig(LPDWORD speakerConfig)
	{
		if (speakerConfig != nullptr) {
			*speakerConfig = DSSPEAKER_STEREO;
		}
		return S_OK;
	}
};
