#include <array>
#include <cstring>
#include <iostream>

#include "sha.h"

namespace {
bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

bool expect_digest(const SHAEngine &engine, const char *expected, const char *message)
{
	std::array<unsigned char, 20> digest{};
	const int copied = engine.Result(digest.data());
	return expect(copied == static_cast<int>(digest.size()), "SHA digest size mismatch") &&
		expect(std::memcmp(digest.data(), expected, digest.size()) == 0, message);
}
}

int main()
{
	if (!expect(SHAEngine::Digest_Size() == 20, "SHAEngine digest size should be 20 bytes")) {
		return 1;
	}

	SHAEngine one_shot;
	one_shot.Hash(SHA_SOURCE1, static_cast<long>(std::strlen(SHA_SOURCE1)));
	if (!expect_digest(one_shot, SHA_DIGEST1a, "SHA digest for source1 mismatch")) {
		return 1;
	}
	if (!expect_digest(one_shot, SHA_DIGEST1a, "cached SHA digest for source1 mismatch")) {
		return 1;
	}

	SHAEngine split_update;
	split_update.Hash(SHA_SOURCE2, 3);
	split_update.Hash(&SHA_SOURCE2[3], static_cast<long>(std::strlen(SHA_SOURCE2) - 3));
	if (!expect_digest(split_update, SHA_DIGEST2a, "SHA digest for split source2 mismatch")) {
		return 1;
	}

	split_update.Init();
	split_update.Hash(SHA_SOURCE1, static_cast<long>(std::strlen(SHA_SOURCE1)));
	if (!expect_digest(split_update, SHA_DIGEST1a, "SHA digest after Init mismatch")) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":\"sha.cpp\",\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
