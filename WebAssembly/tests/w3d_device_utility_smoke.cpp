#include <cmath>
#include <cstdio>
#include <vector>

#include "PreRTS.h"

#include "W3DDevice/GameClient/TileData.h"
#include "W3DDevice/GameClient/W3DPoly.h"

namespace {
bool near(float actual, float expected, float epsilon = 0.0001f)
{
	return std::fabs(actual - expected) <= epsilon;
}

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::fprintf(stderr, "%s\n", message);
		return false;
	}
	return true;
}

std::vector<UnsignedByte> mip_expected(const UnsignedByte *source, int high_width)
{
	const int low_width = high_width / 2;
	std::vector<UnsignedByte> expected(low_width * low_width * TILE_BYTES_PER_PIXEL);

	for (int y = 0; y < high_width; y += 2) {
		for (int x = 0; x < high_width; x += 2) {
			for (int channel = 0; channel < TILE_BYTES_PER_PIXEL; ++channel) {
				const int high_index = (y * high_width + x) * TILE_BYTES_PER_PIXEL + channel;
				const int low_index = ((y / 2) * low_width + (x / 2)) * TILE_BYTES_PER_PIXEL + channel;
				const int pixel =
					source[high_index] +
					source[high_index + TILE_BYTES_PER_PIXEL] +
					source[high_index + TILE_BYTES_PER_PIXEL * high_width] +
					source[high_index + TILE_BYTES_PER_PIXEL * high_width + TILE_BYTES_PER_PIXEL] +
					2;
				expected[low_index] = static_cast<UnsignedByte>(pixel / 4);
			}
		}
	}

	return expected;
}

bool expect_mip(const UnsignedByte *source, int high_width, const UnsignedByte *actual)
{
	const std::vector<UnsignedByte> expected = mip_expected(source, high_width);
	for (std::size_t index = 0; index < expected.size(); ++index) {
		if (actual[index] != expected[index]) {
			std::fprintf(stderr, "mip mismatch at byte %zu: got %u expected %u\n",
				index, static_cast<unsigned>(actual[index]), static_cast<unsigned>(expected[index]));
			return false;
		}
	}
	return true;
}

bool smoke_tile_data()
{
	TileData *tile = new TileData();
	UnsignedByte *base = tile->getDataPtr();

	if (!expect(TileData::dataLen() == DATA_LEN_BYTES, "TileData length mismatch")) {
		tile->Release_Ref();
		return false;
	}

	for (int y = 0; y < TILE_PIXEL_EXTENT; ++y) {
		for (int x = 0; x < TILE_PIXEL_EXTENT; ++x) {
			for (int channel = 0; channel < TILE_BYTES_PER_PIXEL; ++channel) {
				base[(y * TILE_PIXEL_EXTENT + x) * TILE_BYTES_PER_PIXEL + channel] =
					static_cast<UnsignedByte>((x + y * 2 + channel * 3) & 0xff);
			}
		}
	}

	tile->updateMips();

	const int widths[] = { 64, 32, 16, 8, 4, 2, 1 };
	for (int width : widths) {
		if (!expect(tile->hasRGBDataForWidth(width), "TileData reported a missing valid mip width")) {
			tile->Release_Ref();
			return false;
		}
	}

	if (!expect(!tile->hasRGBDataForWidth(3), "TileData accepted an invalid mip width")) {
		tile->Release_Ref();
		return false;
	}
	if (!expect(tile->getRGBDataForWidth(64) == base, "TileData base pointer mismatch")) {
		tile->Release_Ref();
		return false;
	}
	if (!expect(tile->getRGBDataForWidth(99) == base, "TileData default pointer mismatch")) {
		tile->Release_Ref();
		return false;
	}

	const UnsignedByte *mip32 = tile->getRGBDataForWidth(32);
	const UnsignedByte *mip16 = tile->getRGBDataForWidth(16);
	const UnsignedByte *mip8 = tile->getRGBDataForWidth(8);
	const UnsignedByte *mip4 = tile->getRGBDataForWidth(4);
	const UnsignedByte *mip2 = tile->getRGBDataForWidth(2);
	const UnsignedByte *mip1 = tile->getRGBDataForWidth(1);

	const bool ok =
		expect_mip(base, 64, mip32) &&
		expect_mip(mip32, 32, mip16) &&
		expect_mip(mip16, 16, mip8) &&
		expect_mip(mip8, 8, mip4) &&
		expect_mip(mip4, 4, mip2) &&
		expect_mip(mip2, 2, mip1);

	tile->Release_Ref();
	return ok;
}

bool smoke_w3d_poly()
{
	ClipPolyClass source;
	source.Add_Vertex(Vector3(-1.0f, -1.0f, 0.0f));
	source.Add_Vertex(Vector3(1.0f, -1.0f, 0.0f));
	source.Add_Vertex(Vector3(1.0f, 1.0f, 0.0f));
	source.Add_Vertex(Vector3(-1.0f, 1.0f, 0.0f));

	ClipPolyClass clipped;
	source.Clip(PlaneClass(Vector3(1.0f, 0.0f, 0.0f), 0.0f), clipped);

	if (!expect(clipped.Verts.Count() == 4, "clipped polygon vertex count mismatch")) {
		return false;
	}

	bool saw_left_edge = false;
	bool saw_clip_edge = false;
	for (int index = 0; index < clipped.Verts.Count(); ++index) {
		const Vector3 &vertex = clipped.Verts[index];
		if (!expect(vertex.X <= 0.0001f, "clipped polygon kept an outside vertex")) {
			return false;
		}
		saw_left_edge = saw_left_edge || near(vertex.X, -1.0f);
		saw_clip_edge = saw_clip_edge || near(vertex.X, 0.0f);
	}

	return expect(saw_left_edge, "clipped polygon lost the original inside edge") &&
		expect(saw_clip_edge, "clipped polygon did not create a plane intersection edge");
}
}

int main()
{
	if (!smoke_tile_data()) {
		return 1;
	}
	if (!smoke_w3d_poly()) {
		return 1;
	}

	std::printf("{\"ok\":true,\"smoke\":\"w3d-device-utility\"}\n");
	return 0;
}
