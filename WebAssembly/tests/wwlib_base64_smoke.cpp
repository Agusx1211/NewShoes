#include <array>
#include <cstring>
#include <iostream>

#include "base64.h"

namespace {
bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

bool expect_encoded(const char *plain, const char *encoded)
{
	std::array<char, 64> buffer{};
	const int written = Base64_Encode(plain, static_cast<int>(std::strlen(plain)),
		buffer.data(), static_cast<int>(buffer.size()));
	return expect(written == static_cast<int>(std::strlen(encoded)), "Base64 encoded length mismatch") &&
		expect(std::strncmp(buffer.data(), encoded, buffer.size()) == 0, "Base64 encoded text mismatch");
}
}

int main()
{
	if (!expect_encoded("f", "Zg==")) {
		return 1;
	}
	if (!expect_encoded("fo", "Zm8=")) {
		return 1;
	}
	if (!expect_encoded("foo", "Zm9v")) {
		return 1;
	}
	if (!expect_encoded("Generals Zero Hour", "R2VuZXJhbHMgWmVybyBIb3Vy")) {
		return 1;
	}

	char decoded_text[64] = {};
	const char *spaced_source = "R2Vu\r\nZXJh bHMgWmVybyBIb3Vy";
	const int decoded = Base64_Decode(spaced_source, static_cast<int>(std::strlen(spaced_source)),
		decoded_text, static_cast<int>(sizeof(decoded_text)));
	if (!expect(decoded == 18, "Base64 decoded text length mismatch")) {
		return 1;
	}
	if (!expect(std::memcmp(decoded_text, "Generals Zero Hour", 18) == 0,
			"Base64 decoded text mismatch")) {
		return 1;
	}

	const unsigned char binary[] = {0x00, 0xFF, 0x10, 0x20, 0x7F};
	std::array<char, 16> encoded_binary{};
	const int encoded_binary_len = Base64_Encode(binary, static_cast<int>(sizeof(binary)),
		encoded_binary.data(), static_cast<int>(encoded_binary.size()));
	if (!expect(encoded_binary_len == 8, "Base64 binary encoded length mismatch")) {
		return 1;
	}
	if (!expect(std::strncmp(encoded_binary.data(), "AP8QIH8=", encoded_binary.size()) == 0,
			"Base64 binary encoding mismatch")) {
		return 1;
	}

	std::array<unsigned char, sizeof(binary)> decoded_binary{};
	const int decoded_binary_len = Base64_Decode(encoded_binary.data(), encoded_binary_len,
		decoded_binary.data(), static_cast<int>(decoded_binary.size()));
	if (!expect(decoded_binary_len == static_cast<int>(sizeof(binary)),
			"Base64 binary decoded length mismatch")) {
		return 1;
	}
	if (!expect(std::memcmp(decoded_binary.data(), binary, sizeof(binary)) == 0,
			"Base64 binary round-trip mismatch")) {
		return 1;
	}

	std::array<char, 3> too_small{};
	if (!expect(Base64_Encode("foo", 3, too_small.data(), static_cast<int>(too_small.size())) == 0,
			"Base64 encode should not write partial packets")) {
		return 1;
	}
	if (!expect(Base64_Decode("Zm9v", 4, decoded_text, 0) == 0,
			"Base64 decode should reject zero-sized destination")) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":\"base64.cpp\",\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
