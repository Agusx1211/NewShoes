#include <cstdio>

#include "bink.h"

extern "C" int WasmBinkProviderCanDecodeFrames();

namespace {
int g_failures = 0;

void fail(const char *message)
{
	std::fprintf(stderr, "FAIL: %s\n", message);
	++g_failures;
}

bool expect(bool condition, const char *message)
{
	if (!condition) {
		fail(message);
		return false;
	}
	return true;
}

bool expect_bink_payload(
	const char *path,
	u32 expected_frames,
	u32 expected_width,
	u32 expected_height)
{
	HBINK bink = BinkOpen(path, BINKPRELOADALL);
	if (!expect(bink != nullptr, "BinkOpen returned null")) {
		return false;
	}

	bool ok = true;
	ok = expect(bink->Frames == expected_frames, "unexpected Bink frame count") && ok;
	ok = expect(bink->Width == expected_width, "unexpected Bink width") && ok;
	ok = expect(bink->Height == expected_height, "unexpected Bink height") && ok;
	ok = expect(bink->FrameNum == 1, "BinkOpen should start on frame 1") && ok;
	ok = expect(BinkWait(bink) == 0, "BinkWait should report first frame ready") && ok;

	BinkDoFrame(bink);
	BinkNextFrame(bink);
	ok = expect(bink->FrameNum == 2, "BinkNextFrame should advance to frame 2") && ok;

	BinkGoto(bink, expected_frames + 10, 0);
	ok = expect(bink->FrameNum == expected_frames, "BinkGoto should clamp past-end frames") && ok;

	BinkGoto(bink, 0, 0);
	ok = expect(bink->FrameNum == 1, "BinkGoto should clamp frame 0 to frame 1") && ok;

	BinkSetVolume(bink, 0, 12345);
	BinkClose(bink);
	return ok;
}
}

extern "C" int run_bink_video_provider_smoke(const char *gc_background_path, const char *vs_small_path)
{
	if (gc_background_path == nullptr || gc_background_path[0] == '\0' ||
			vs_small_path == nullptr || vs_small_path[0] == '\0') {
		std::fprintf(stderr, "run_bink_video_provider_smoke requires both BIK payload paths\n");
		return 1;
	}

	const bool gc_ok = expect_bink_payload(gc_background_path, 180, 800, 600);
	const bool original_path_ok = expect_bink_payload("Data\\English\\Movies\\VS_small.bik", 71, 96, 120);
	const bool direct_vs_ok = expect_bink_payload(vs_small_path, 71, 96, 120);
	const bool ok = gc_ok && original_path_ok && direct_vs_ok;
	std::printf(
		"{\"ok\":%s,\"gcBackground\":{\"frames\":180,\"width\":800,\"height\":600},"
		"\"vsSmall\":{\"frames\":71,\"width\":96,\"height\":120},"
		"\"originalPathResolution\":%s,\"decodeReady\":%s,\"failures\":%d}\n",
		ok && g_failures == 0 ? "true" : "false",
		original_path_ok ? "true" : "false",
		WasmBinkProviderCanDecodeFrames() ? "true" : "false",
		g_failures);

	return ok && g_failures == 0 ? 0 : 1;
}

#ifndef BINK_VIDEO_PROVIDER_SMOKE_NO_MAIN
int main()
{
	std::fprintf(stderr,
		"usage: call run_bink_video_provider_smoke(gcPath, vsPath); "
		"the npm script uses tools/run_bink_video_provider_smoke.mjs\n");
	return 1;
}
#endif
