#pragma once

#include "windows.h"

#ifndef _INC_VFW
#define _INC_VFW
#endif

#ifndef OF_WRITE
#define OF_WRITE 0x00000001
#endif

#ifndef OF_CREATE
#define OF_CREATE 0x00001000
#endif

#ifndef AVIIF_KEYFRAME
#define AVIIF_KEYFRAME 0x00000010L
#endif

#ifndef mmioFOURCC
#define mmioFOURCC(ch0, ch1, ch2, ch3) \
	(static_cast<DWORD>(static_cast<unsigned char>(ch0)) | \
	(static_cast<DWORD>(static_cast<unsigned char>(ch1)) << 8) | \
	(static_cast<DWORD>(static_cast<unsigned char>(ch2)) << 16) | \
	(static_cast<DWORD>(static_cast<unsigned char>(ch3)) << 24))
#endif

#ifndef streamtypeVIDEO
#define streamtypeVIDEO mmioFOURCC('v', 'i', 'd', 's')
#endif

using PAVIFILE = void *;
using PAVISTREAM = void *;

struct AVISTREAMINFO
{
	DWORD fccType;
	DWORD fccHandler;
	DWORD dwFlags;
	DWORD dwCaps;
	WORD wPriority;
	WORD wLanguage;
	DWORD dwScale;
	DWORD dwRate;
	DWORD dwStart;
	DWORD dwLength;
	DWORD dwInitialFrames;
	DWORD dwSuggestedBufferSize;
	DWORD dwQuality;
	DWORD dwSampleSize;
	RECT rcFrame;
	DWORD dwEditCount;
	DWORD dwFormatChangeCount;
	char szName[64];
};

void AVIFileInit();
void AVIFileExit();
HRESULT AVIFileOpen(PAVIFILE *file, const char *filename, UINT mode, void *handler);
HRESULT AVIFileCreateStream(PAVIFILE file, PAVISTREAM *stream, AVISTREAMINFO *stream_info);
HRESULT AVIStreamSetFormat(PAVISTREAM stream, LONG position, void *format, LONG format_size);
HRESULT AVIStreamWrite(
	PAVISTREAM stream,
	LONG start,
	LONG samples,
	void *buffer,
	LONG buffer_size,
	DWORD flags,
	LONG *samples_written,
	LONG *bytes_written);
ULONG AVIStreamRelease(PAVISTREAM stream);
ULONG AVIFileRelease(PAVIFILE file);
