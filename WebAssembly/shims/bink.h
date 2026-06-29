#pragma once

#include <cstdint>

using u32 = std::uint32_t;

struct BINK
{
	u32 Width;
	u32 Height;
	u32 Frames;
	u32 FrameNum;
};

using HBINK = BINK *;

constexpr u32 BINKPRELOADALL = 0x00002000u;
constexpr u32 BINKSURFACE24 = 1u;
constexpr u32 BINKSURFACE32 = 3u;
constexpr u32 BINKSURFACE555 = 5u;
constexpr u32 BINKSURFACE565 = 6u;

extern "C" {
HBINK BinkOpen(const char *name, u32 flags);
void BinkClose(HBINK bink);
int BinkWait(HBINK bink);
void BinkDoFrame(HBINK bink);
void BinkNextFrame(HBINK bink);
void BinkGoto(HBINK bink, u32 frame, u32 flags);
void BinkCopyToBuffer(HBINK bink, void *dest, u32 destPitch, u32 destHeight, u32 destX, u32 destY, u32 flags);
void BinkSetVolume(HBINK bink, u32 trackId, int volume);
int BinkSoundUseDirectSound(void *directSound);
void BinkSetSoundTrack(u32 totalTracks, const u32 *tracks);
int WasmBinkProviderCanDecodeFrames();
int WasmBinkProviderHasBrowserVideo(HBINK bink);
const char *WasmBinkProviderGetBrowserVideoPath(HBINK bink);
const char *WasmBinkProviderGetBrowserVideoCodec(HBINK bink);
const char *WasmBinkProviderGetBrowserAudioCodec(HBINK bink);
u32 WasmBinkProviderGetBrowserVideoFrameCount(HBINK bink);
double WasmBinkProviderGetBrowserVideoDurationSeconds(HBINK bink);
}
