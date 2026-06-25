#include <algorithm>
#include <cstring>
#include <iostream>
#include <string>
#include <vector>

#include "lzo.h"
#include "lzopipe.h"
#include "lzostraw.h"
#include "pipe.h"
#include "straw.h"

namespace {
class MemoryPipe : public Pipe
{
public:
	int Put(void const *source, int length) override
	{
		if (source == nullptr || length <= 0) {
			return 0;
		}
		const auto *bytes = static_cast<const unsigned char *>(source);
		Data.insert(Data.end(), bytes, bytes + length);
		return length;
	}

	std::vector<unsigned char> Data;
};

class MemoryStraw : public Straw
{
public:
	MemoryStraw(const void *source, int length) :
		Bytes(static_cast<const unsigned char *>(source),
			static_cast<const unsigned char *>(source) + length),
		Offset(0)
	{
	}

	int Get(void *buffer, int length) override
	{
		if (buffer == nullptr || length <= 0 || Offset >= Bytes.size()) {
			return 0;
		}
		const int available = static_cast<int>(Bytes.size() - Offset);
		const int copied = std::min(length, available);
		std::memcpy(buffer, Bytes.data() + Offset, copied);
		Offset += copied;
		return copied;
	}

private:
	std::vector<unsigned char> Bytes;
	size_t Offset;
};

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

std::string payload()
{
	std::string data;
	for (int index = 0; index < 128; ++index) {
		data += "Generals Zero Hour original WWLib LZO stream data ";
		data += static_cast<char>('A' + (index % 26));
		data += '\n';
	}
	return data;
}

std::vector<unsigned char> read_straw(Straw &straw, int chunk_size)
{
	std::vector<unsigned char> output;
	std::vector<unsigned char> buffer(static_cast<size_t>(chunk_size));
	for (;;) {
		const int read = straw.Get(buffer.data(), chunk_size);
		if (read <= 0) {
			break;
		}
		output.insert(output.end(), buffer.begin(), buffer.begin() + read);
	}
	return output;
}
}

int main()
{
	const std::string plain = payload();

	{
		std::vector<unsigned char> compressed(LZO_BUFFER_SIZE(plain.size()));
		lzo_uint compressed_length = static_cast<lzo_uint>(compressed.size());
		const int compress_result = LZOCompressor::Compress(
			reinterpret_cast<const lzo_byte *>(plain.data()),
			static_cast<lzo_uint>(plain.size()),
			compressed.data(),
			&compressed_length);
		if (!expect(compress_result == LZO_E_OK, "LZOCompressor::Compress failed")) {
			return 1;
		}

		std::vector<unsigned char> decompressed(plain.size());
		lzo_uint decompressed_length = static_cast<lzo_uint>(decompressed.size());
		const int decompress_result = LZOCompressor::Decompress(
			compressed.data(),
			compressed_length,
			decompressed.data(),
			&decompressed_length);
		if (!expect(decompress_result == LZO_E_OK &&
				decompressed_length == plain.size() &&
				std::memcmp(decompressed.data(), plain.data(), plain.size()) == 0,
				"LZOCompressor round trip failed")) {
			return 1;
		}
	}

	{
		LZOPipe compressor(LZOPipe::COMPRESS, 257);
		MemoryPipe compressed;
		compressor.Put_To(compressed);
		compressor.Put(plain.data(), 113);
		compressor.Put(plain.data() + 113, static_cast<int>(plain.size()) - 113);
		compressor.Flush();

		LZOPipe decompressor(LZOPipe::DECOMPRESS, 257);
		MemoryPipe decompressed;
		decompressor.Put_To(decompressed);
		decompressor.Put(compressed.Data.data(), 17);
		decompressor.Put(compressed.Data.data() + 17, static_cast<int>(compressed.Data.size()) - 17);
		decompressor.Flush();

		if (!expect(decompressed.Data.size() == plain.size() &&
				std::memcmp(decompressed.Data.data(), plain.data(), plain.size()) == 0,
				"LZOPipe round trip failed")) {
			return 1;
		}
	}

	{
		MemoryStraw source(plain.data(), static_cast<int>(plain.size()));
		LZOStraw compressor(LZOStraw::COMPRESS, 193);
		compressor.Get_From(source);
		std::vector<unsigned char> compressed = read_straw(compressor, 29);

		MemoryStraw compressed_source(compressed.data(), static_cast<int>(compressed.size()));
		LZOStraw decompressor(LZOStraw::DECOMPRESS, 193);
		decompressor.Get_From(compressed_source);
		std::vector<unsigned char> decompressed = read_straw(decompressor, 31);

		if (!expect(decompressed.size() == plain.size() &&
				std::memcmp(decompressed.data(), plain.data(), plain.size()) == 0,
				"LZOStraw round trip failed")) {
			return 1;
		}
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":\"LZO codec and stream adapters\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
