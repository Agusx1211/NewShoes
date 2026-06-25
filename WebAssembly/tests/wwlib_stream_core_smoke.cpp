#include <algorithm>
#include <array>
#include <cstring>
#include <iostream>
#include <string>
#include <vector>

#include "b64pipe.h"
#include "b64straw.h"
#include "blowpipe.h"
#include "blwstraw.h"
#include "crcpipe.h"
#include "crcstraw.h"
#include "cstraw.h"
#include "iff.h"
#include "lcw.h"
#include "lcwpipe.h"
#include "pipe.h"
#include "rndstraw.h"
#include "shapipe.h"
#include "shastraw.h"
#include "straw.h"
#include "vector.h"

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

bool equals_bytes(const std::vector<unsigned char> &actual, const char *expected, size_t length)
{
	return actual.size() == length &&
		std::memcmp(actual.data(), expected, length) == 0;
}

template <size_t Size>
bool equals_array(const std::array<unsigned char, Size> &actual, const unsigned char *expected)
{
	return std::memcmp(actual.data(), expected, Size) == 0;
}

std::array<unsigned char, 20> sha_digest_for(const char *text)
{
	SHAEngine sha;
	sha.Hash(text, static_cast<long>(std::strlen(text)));
	std::array<unsigned char, 20> digest{};
	sha.Result(digest.data());
	return digest;
}

long ww_crc_for(const char *text)
{
	CRCEngine crc;
	return crc(text, static_cast<int>(std::strlen(text)));
}

std::string read_straw(Straw &straw, int chunk_size)
{
	std::string output;
	std::array<char, 8> buffer{};
	for (;;) {
		const int read = straw.Get(buffer.data(), std::min<int>(chunk_size, buffer.size()));
		if (read <= 0) {
			break;
		}
		output.append(buffer.data(), static_cast<size_t>(read));
	}
	return output;
}

bool expect_random_sequence_repeat()
{
	RandomStraw first;
	RandomStraw second;
	for (int index = 0; index < 32; ++index) {
		first.Seed_Long(0x12345678L + index);
		second.Seed_Long(0x12345678L + index);
	}
	std::array<unsigned char, 32> first_bytes{};
	std::array<unsigned char, 32> second_bytes{};
	const int first_read = first.Get(first_bytes.data(), first_bytes.size());
	const int second_read = second.Get(second_bytes.data(), second_bytes.size());
	return first_read == static_cast<int>(first_bytes.size()) &&
		second_read == static_cast<int>(second_bytes.size()) &&
		first_bytes == second_bytes &&
		std::any_of(first_bytes.begin(), first_bytes.end(), [](unsigned char value) {
			return value != 0;
		});
}
}

int main()
{
	const char plain[] = "Generals Zero Hour";
	constexpr size_t plain_length = sizeof(plain) - 1;
	const char expected_base64[] = "R2VuZXJhbHMgWmVybyBIb3Vy";

	{
		Pipe source;
		MemoryPipe sink;
		source.Put_To(sink);
		if (!expect(source.Put(plain, 8) == 8 &&
				source.Put(plain + 8, plain_length - 8) == static_cast<int>(plain_length - 8),
				"Pipe pass-through count failed")) {
			return 1;
		}
		if (!expect(equals_bytes(sink.Data, plain, plain_length), "Pipe pass-through data failed")) {
			return 1;
		}
	}

	{
		Base64Pipe encoder(Base64Pipe::ENCODE);
		MemoryPipe sink;
		encoder.Put_To(sink);
		encoder.Put(plain, 5);
		encoder.Put(plain + 5, plain_length - 5);
		encoder.Flush();
		if (!expect(equals_bytes(sink.Data, expected_base64, std::strlen(expected_base64)),
				"Base64Pipe encode failed")) {
			return 1;
		}

		Base64Pipe decoder(Base64Pipe::DECODE);
		MemoryPipe decoded;
		decoder.Put_To(decoded);
		decoder.Put(sink.Data.data(), static_cast<int>(sink.Data.size()));
		decoder.Flush();
		if (!expect(equals_bytes(decoded.Data, plain, plain_length), "Base64Pipe decode failed")) {
			return 1;
		}
	}

	{
		MemoryStraw source(plain, plain_length);
		Base64Straw encoder(Base64Straw::ENCODE);
		encoder.Get_From(source);
		const std::string encoded = read_straw(encoder, 5);
		if (!expect(encoded == expected_base64, "Base64Straw encode failed")) {
			return 1;
		}

		MemoryStraw encoded_source(encoded.data(), static_cast<int>(encoded.size()));
		Base64Straw decoder(Base64Straw::DECODE);
		decoder.Get_From(encoded_source);
		if (!expect(read_straw(decoder, 4) == plain, "Base64Straw decode failed")) {
			return 1;
		}
	}

	{
		CRCPipe crc_pipe;
		MemoryPipe sink;
		crc_pipe.Put_To(sink);
		crc_pipe.Put(plain, 7);
		crc_pipe.Put(plain + 7, plain_length - 7);
		if (!expect(equals_bytes(sink.Data, plain, plain_length), "CRCPipe pass-through failed")) {
			return 1;
		}
		if (!expect(crc_pipe.Result() == ww_crc_for(plain),
				"CRCPipe result failed")) {
			return 1;
		}

		MemoryStraw source(plain, plain_length);
		CRCStraw crc_straw;
		crc_straw.Get_From(source);
		if (!expect(read_straw(crc_straw, 6) == plain, "CRCStraw pass-through failed")) {
			return 1;
		}
		if (!expect(crc_straw.Result() == ww_crc_for(plain),
				"CRCStraw result failed")) {
			return 1;
		}
	}

	{
		const auto expected_digest = sha_digest_for(plain);
		SHAPipe sha_pipe;
		MemoryPipe sink;
		sha_pipe.Put_To(sink);
		sha_pipe.Put(plain, static_cast<int>(plain_length));
		std::array<unsigned char, 20> digest{};
		sha_pipe.Result(digest.data());
		if (!expect(digest == expected_digest, "SHAPipe digest failed")) {
			return 1;
		}

		MemoryStraw source(plain, plain_length);
		SHAStraw sha_straw;
		sha_straw.Get_From(source);
		if (!expect(read_straw(sha_straw, 3) == plain, "SHAStraw pass-through failed")) {
			return 1;
		}
		sha_straw.Result(digest.data());
		if (!expect(digest == expected_digest, "SHAStraw digest failed")) {
			return 1;
		}
	}

	{
		const unsigned char zero_key[8] = {};
		const unsigned char zero_block[8] = {};
		const unsigned char expected_cipher[8] = {
			0x4e, 0xf9, 0x97, 0x45, 0x61, 0x98, 0xdd, 0x78
		};

		BlowPipe encrypt_pipe(BlowPipe::ENCRYPT);
		MemoryPipe encrypted;
		encrypt_pipe.Put_To(encrypted);
		encrypt_pipe.Key(zero_key, sizeof(zero_key));
		encrypt_pipe.Put(zero_block, sizeof(zero_block));
		encrypt_pipe.Flush();
		if (!expect(encrypted.Data.size() == sizeof(expected_cipher) &&
				std::memcmp(encrypted.Data.data(), expected_cipher, sizeof(expected_cipher)) == 0,
				"BlowPipe encrypt failed")) {
			return 1;
		}

		BlowPipe decrypt_pipe(BlowPipe::DECRYPT);
		MemoryPipe decrypted;
		decrypt_pipe.Put_To(decrypted);
		decrypt_pipe.Key(zero_key, sizeof(zero_key));
		decrypt_pipe.Put(encrypted.Data.data(), static_cast<int>(encrypted.Data.size()));
		decrypt_pipe.Flush();
		if (!expect(decrypted.Data.size() == sizeof(zero_block) &&
				std::memcmp(decrypted.Data.data(), zero_block, sizeof(zero_block)) == 0,
				"BlowPipe decrypt failed")) {
			return 1;
		}

		MemoryStraw cipher_source(expected_cipher, sizeof(expected_cipher));
		BlowStraw decrypt_straw(BlowStraw::DECRYPT);
		decrypt_straw.Key(zero_key, sizeof(zero_key));
		decrypt_straw.Get_From(cipher_source);
		std::array<unsigned char, 8> straw_plain{};
		if (!expect(decrypt_straw.Get(straw_plain.data(), straw_plain.size()) == 8 &&
				equals_array(straw_plain, zero_block), "BlowStraw decrypt failed")) {
			return 1;
		}
	}

	{
		const std::string lcw_plain =
			"Literal LCW data with enough length to cross packet boundaries.";
		std::vector<unsigned char> compressed(lcw_plain.size() + lcw_plain.size() / 63 + 3);
		const int compressed_size = LCW_Comp(
			lcw_plain.data(), compressed.data(), static_cast<int>(lcw_plain.size()));
		if (!expect(compressed_size > 0 &&
				compressed_size <= static_cast<int>(compressed.size()),
				"LCW_Comp size failed")) {
			return 1;
		}

		std::vector<unsigned char> decompressed(lcw_plain.size());
		const int decompressed_size = LCW_Uncomp(
			compressed.data(), decompressed.data(), static_cast<unsigned long>(decompressed.size()));
		if (!expect(decompressed_size == static_cast<int>(lcw_plain.size()) &&
				std::memcmp(decompressed.data(), lcw_plain.data(), lcw_plain.size()) == 0,
				"LCW direct round trip failed")) {
			return 1;
		}
	}

	{
		const char lcw_pipe_plain[] =
			"LCWPipe round trip across multiple small blocks and partial flush.";
		constexpr size_t lcw_pipe_length = sizeof(lcw_pipe_plain) - 1;
		LCWPipe compressor(LCWPipe::COMPRESS, 16);
		MemoryPipe compressed;
		compressor.Put_To(compressed);
		compressor.Put(lcw_pipe_plain, 11);
		compressor.Put(lcw_pipe_plain + 11, static_cast<int>(lcw_pipe_length - 11));
		compressor.Flush();

		LCWPipe decompressor(LCWPipe::DECOMPRESS, 16);
		MemoryPipe decompressed;
		decompressor.Put_To(decompressed);
		decompressor.Put(compressed.Data.data(), 3);
		decompressor.Put(compressed.Data.data() + 3,
			static_cast<int>(compressed.Data.size() - 3));
		decompressor.Flush();
		if (!expect(equals_bytes(decompressed.Data, lcw_pipe_plain, lcw_pipe_length),
				"LCWPipe round trip failed")) {
			return 1;
		}
	}

	{
		const char raw_plain[] = "Uncompress_Data raw block";
		constexpr size_t raw_length = sizeof(raw_plain) - 1;
		std::vector<unsigned char> raw_block(sizeof(CompHeaderType) + raw_length);
		auto *raw_header = reinterpret_cast<CompHeaderType *>(raw_block.data());
		raw_header->Method = NOCOMPRESS;
		raw_header->pad = 0;
		raw_header->Size = raw_length;
		raw_header->Skip = 0;
		std::memcpy(raw_block.data() + sizeof(CompHeaderType), raw_plain, raw_length);
		std::array<unsigned char, raw_length> raw_output{};
		if (!expect(Uncompress_Data(raw_block.data(), raw_output.data()) == raw_length &&
				std::memcmp(raw_output.data(), raw_plain, raw_length) == 0,
				"Uncompress_Data raw block failed")) {
			return 1;
		}

		const char lcw_block_plain[] = "Uncompress_Data LCW block";
		constexpr size_t lcw_block_length = sizeof(lcw_block_plain) - 1;
		std::vector<unsigned char> lcw_payload(lcw_block_length + lcw_block_length / 63 + 3);
		const int lcw_payload_size = LCW_Comp(
			lcw_block_plain, lcw_payload.data(), static_cast<int>(lcw_block_length));
		std::vector<unsigned char> lcw_block(sizeof(CompHeaderType) + lcw_payload_size);
		auto *lcw_header = reinterpret_cast<CompHeaderType *>(lcw_block.data());
		lcw_header->Method = LCW;
		lcw_header->pad = 0;
		lcw_header->Size = lcw_block_length;
		lcw_header->Skip = 0;
		std::memcpy(lcw_block.data() + sizeof(CompHeaderType),
			lcw_payload.data(), static_cast<size_t>(lcw_payload_size));
		std::array<unsigned char, lcw_block_length> lcw_output{};
		if (!expect(Uncompress_Data(lcw_block.data(), lcw_output.data()) == lcw_block_length &&
				std::memcmp(lcw_output.data(), lcw_block_plain, lcw_block_length) == 0,
				"Uncompress_Data LCW block failed")) {
			return 1;
		}
	}

	{
		MemoryStraw source(plain, plain_length);
		CacheStraw cache(5);
		cache.Get_From(source);
		if (!expect(read_straw(cache, 2) == plain, "CacheStraw chunking failed")) {
			return 1;
		}
	}

	if (!expect(expect_random_sequence_repeat(), "RandomStraw deterministic seeding failed")) {
		return 1;
	}

	{
		BooleanVectorClass flags(10);
		flags.Reset();
		flags[3] = true;
		flags[7] = true;
		if (!expect(flags.Is_True(3) && flags.Is_True(7) && !flags.Is_True(4),
				"BooleanVector bit access failed")) {
			return 1;
		}
		if (!expect(flags.First_True() == 3 && flags.First_False() == 0,
				"BooleanVector scan failed")) {
			return 1;
		}
		BooleanVectorClass copy(flags);
		if (!expect(copy == flags, "BooleanVector copy/equality failed")) {
			return 1;
		}
		flags.Set();
		if (!expect(flags.First_False() == -1, "BooleanVector Set failed")) {
			return 1;
		}
		flags.Resize(12);
		if (!expect(flags.Length() == 12, "BooleanVector resize failed")) {
			return 1;
		}
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":\"pipe/straw stream core plus LCW adapters and load helpers\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
