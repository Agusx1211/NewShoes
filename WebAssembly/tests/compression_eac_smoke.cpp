#include <cstring>
#include <iostream>
#include <vector>

#include "codex.h"
#include "btreecodex.h"
#include "huffcodex.h"
#include "refcodex.h"

namespace {
struct CodecCase
{
	const char *name;
	int (*encode)(void *, const void *, int, int *);
	int (*decode)(void *, const void *, int *);
	int (*size)(const void *);
	bool (*is)(const void *);
	bool reports_consumed_size;
};

bool run_round_trip(const CodecCase &codec)
{
	const char input[] =
		"Generals Zero Hour wasm EAC compression smoke. "
		"Repeated payload repeated payload repeated payload.";
	const int input_size = static_cast<int>(std::strlen(input));

	std::vector<unsigned char> compressed(input_size * 4 + 4096);
	const int compressed_size = codec.encode(compressed.data(), input, input_size, nullptr);
	if (compressed_size <= 0) {
		std::cerr << codec.name << " encode failed\n";
		return false;
	}

	if (!codec.is(compressed.data())) {
		std::cerr << codec.name << " rejected encoded payload\n";
		return false;
	}

	const int reported_size = codec.size(compressed.data());
	if (reported_size != input_size) {
		std::cerr << codec.name << " size mismatch: " << reported_size
			<< " != " << input_size << "\n";
		return false;
	}

	std::vector<unsigned char> decoded(input_size);
	int consumed_size = 0;
	const int decoded_size = codec.decode(decoded.data(), compressed.data(), &consumed_size);
	if (decoded_size != input_size) {
		std::cerr << codec.name << " decode size mismatch: " << decoded_size
			<< " != " << input_size << "\n";
		return false;
	}

	if (codec.reports_consumed_size && consumed_size != compressed_size) {
		std::cerr << codec.name << " compressed byte count mismatch: " << consumed_size
			<< " != " << compressed_size << "\n";
		return false;
	}

	if (std::memcmp(decoded.data(), input, input_size) != 0) {
		std::cerr << codec.name << " decoded payload mismatch\n";
		return false;
	}

	return true;
}
}

int main()
{
	const CodecCase codecs[] = {
		{"BTree", BTREE_encode, BTREE_decode, BTREE_size, BTREE_is, false},
		{"Huff", HUFF_encode, HUFF_decode, HUFF_size, HUFF_is, false},
		{"RefPack", REF_encode, REF_decode, REF_size, REF_is, true},
	};

	for (const CodecCase &codec : codecs) {
		if (!run_round_trip(codec)) {
			return 1;
		}
	}

	std::cout << "{\"ok\":true,\"codecs\":[\"BTree\",\"Huff\",\"RefPack\"],"
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
