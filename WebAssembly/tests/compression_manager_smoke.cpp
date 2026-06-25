#include <cstring>
#include <iostream>
#include <vector>

#include "Compression.h"

namespace {
struct ManagerCase
{
	const char *name;
	CompressionType type;
	const char *magic;
};

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

bool run_manager_round_trip(const ManagerCase &test_case)
{
	const char input_text[] =
		"CompressionManager wasm smoke over original EAC codecs. "
		"Repeated payload repeated payload repeated payload.";
	const int input_size = static_cast<int>(std::strlen(input_text));
	auto *input = const_cast<char *>(input_text);

	std::vector<unsigned char> compressed(input_size * 4 + 4096);
	const int compressed_size = CompressionManager::compressData(
		test_case.type,
		input,
		input_size,
		compressed.data(),
		static_cast<int>(compressed.size()));
	if (compressed_size <= 0) {
		std::cerr << test_case.name << " manager compression failed\n";
		return false;
	}

	if (!expect(std::memcmp(compressed.data(), test_case.magic, 4) == 0,
		"manager wrote the wrong compression magic")) {
		return false;
	}
	if (!expect(CompressionManager::isDataCompressed(compressed.data(), compressed_size),
		"manager did not identify compressed data")) {
		return false;
	}
	if (!expect(CompressionManager::getCompressionType(compressed.data(), compressed_size) == test_case.type,
		"manager detected the wrong compression type")) {
		return false;
	}
	if (!expect(CompressionManager::getUncompressedSize(compressed.data(), compressed_size) == input_size,
		"manager reported the wrong uncompressed size")) {
		return false;
	}

	std::vector<unsigned char> decoded(input_size);
	const int decoded_size = CompressionManager::decompressData(
		compressed.data(),
		compressed_size,
		decoded.data(),
		static_cast<int>(decoded.size()));
	if (decoded_size != input_size) {
		std::cerr << test_case.name << " manager decompression size mismatch: "
			<< decoded_size << " != " << input_size << "\n";
		return false;
	}
	if (std::memcmp(decoded.data(), input, input_size) != 0) {
		std::cerr << test_case.name << " manager decoded payload mismatch\n";
		return false;
	}

	return true;
}

bool run_plain_data_checks()
{
	const char plain[] = "plain data with no compression magic";
	const int plain_size = static_cast<int>(std::strlen(plain));
	return expect(!CompressionManager::isDataCompressed(plain, plain_size),
			"plain data was identified as compressed") &&
		expect(CompressionManager::getCompressionType(plain, plain_size) == COMPRESSION_NONE,
			"plain data reported the wrong compression type") &&
		expect(CompressionManager::getUncompressedSize(plain, plain_size) == plain_size,
			"plain data reported the wrong uncompressed size") &&
		expect(CompressionManager::getPreferredCompression() == COMPRESSION_REFPACK,
			"preferred compression is not RefPack") &&
		expect(std::strcmp(CompressionManager::getCompressionNameByType(COMPRESSION_REFPACK),
				"RefPack") == 0,
			"RefPack compression name changed") &&
		expect(std::strcmp(CompressionManager::getDecompressionNameByType(COMPRESSION_REFPACK),
				"d_RefPack") == 0,
			"RefPack decompression name changed");
}

bool run_missing_codec_checks()
{
	const unsigned char zlib_header[] = {'Z', 'L', '5', '\0', 123, 0, 0, 0};
	const unsigned char nox_header[] = {'N', 'O', 'X', '\0', 45, 0, 0, 0};
	unsigned char output[128] = {};

	return expect(CompressionManager::getCompressionType(zlib_header, sizeof(zlib_header)) ==
			COMPRESSION_ZLIB5,
			"zlib header detection changed") &&
		expect(CompressionManager::getCompressionType(nox_header, sizeof(nox_header)) ==
			COMPRESSION_NOXLZH,
			"Nox LZH header detection changed") &&
		expect(CompressionManager::getMaxCompressedSize(123, COMPRESSION_ZLIB5) == 0,
			"zlib max-size path should stay disabled until source is restored") &&
		expect(CompressionManager::getMaxCompressedSize(45, COMPRESSION_NOXLZH) == 0,
			"Nox LZH max-size path should stay disabled until source is restored") &&
		expect(CompressionManager::decompressData(
				const_cast<unsigned char *>(zlib_header),
				static_cast<int>(sizeof(zlib_header)),
				output,
				static_cast<int>(sizeof(output))) == 0,
			"zlib decompression should stay disabled until source is restored") &&
		expect(CompressionManager::decompressData(
				const_cast<unsigned char *>(nox_header),
				static_cast<int>(sizeof(nox_header)),
				output,
				static_cast<int>(sizeof(output))) == 0,
			"Nox LZH decompression should stay disabled until source is restored");
}
}

int main()
{
	const ManagerCase cases[] = {
		{"BTree", COMPRESSION_BTREE, "EAB\0"},
		{"Huff", COMPRESSION_HUFF, "EAH\0"},
		{"RefPack", COMPRESSION_REFPACK, "EAR\0"},
	};

	if (!run_plain_data_checks()) {
		return 1;
	}

	for (const ManagerCase &test_case : cases) {
		if (!run_manager_round_trip(test_case)) {
			return 1;
		}
	}

	if (!run_missing_codec_checks()) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"manager\":\"CompressionManager\","
		"\"codecs\":[\"BTree\",\"Huff\",\"RefPack\"],"
		"\"deferred\":[\"ZLib\",\"NoxLZH\"],"
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
