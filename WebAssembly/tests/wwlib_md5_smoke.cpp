#include <array>
#include <cstring>
#include <iostream>

#include "global.h"
#include "md5.h"

namespace {
bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

bool digest_matches(const unsigned char *digest, const std::array<unsigned char, 16> &expected)
{
	return std::memcmp(digest, expected.data(), expected.size()) == 0;
}

std::array<unsigned char, 16> md5_for(unsigned char *data, unsigned int length)
{
	MD5_CTX context;
	std::array<unsigned char, 16> digest{};
	MD5Init(&context);
	MD5Update(&context, data, length);
	MD5Final(digest.data(), &context);
	return digest;
}
}

int main()
{
	std::array<unsigned char, 1> empty_input{};
	const auto empty_digest = md5_for(empty_input.data(), 0);
	const std::array<unsigned char, 16> expected_empty = {
		0xD4, 0x1D, 0x8C, 0xD9, 0x8F, 0x00, 0xB2, 0x04,
		0xE9, 0x80, 0x09, 0x98, 0xEC, 0xF8, 0x42, 0x7E
	};
	if (!expect(digest_matches(empty_digest.data(), expected_empty), "MD5 empty vector mismatch")) {
		return 1;
	}

	unsigned char abc[] = "abc";
	const auto abc_digest = md5_for(abc, 3);
	const std::array<unsigned char, 16> expected_abc = {
		0x90, 0x01, 0x50, 0x98, 0x3C, 0xD2, 0x4F, 0xB0,
		0xD6, 0x96, 0x3F, 0x7D, 0x28, 0xE1, 0x7F, 0x72
	};
	if (!expect(digest_matches(abc_digest.data(), expected_abc), "MD5 abc vector mismatch")) {
		return 1;
	}

	unsigned char message[] = "message digest";
	const auto message_digest = md5_for(message, 14);
	const std::array<unsigned char, 16> expected_message = {
		0xF9, 0x6B, 0x69, 0x7D, 0x7C, 0xB7, 0x93, 0x8D,
		0x52, 0x5A, 0x2F, 0x31, 0xAA, 0xF1, 0x61, 0xD0
	};
	if (!expect(digest_matches(message_digest.data(), expected_message),
			"MD5 message digest vector mismatch")) {
		return 1;
	}

	MD5_CTX split_context;
	std::array<unsigned char, 16> split_digest{};
	unsigned char split_a[] = "abc";
	unsigned char split_b[] = "defghijklmnopqrstuvwxyz";
	const std::array<unsigned char, 16> expected_alphabet = {
		0xC3, 0xFC, 0xD3, 0xD7, 0x61, 0x92, 0xE4, 0x00,
		0x7D, 0xFB, 0x49, 0x6C, 0xCA, 0x67, 0xE1, 0x3B
	};
	MD5Init(&split_context);
	MD5Update(&split_context, split_a, 3);
	MD5Update(&split_context, split_b, 23);
	MD5Final(split_digest.data(), &split_context);
	if (!expect(digest_matches(split_digest.data(), expected_alphabet),
			"MD5 split update vector mismatch")) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":\"md5.cpp\",\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
