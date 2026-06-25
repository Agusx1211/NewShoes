#include <cstring>
#include <iostream>
#include <vector>

#include "codex.h"
#include "refcodex.h"

int main()
{
	const char input[] =
		"Generals Zero Hour wasm RefPack smoke. "
		"Repeated payload repeated payload repeated payload.";
	const int input_size = static_cast<int>(std::strlen(input));

	std::vector<unsigned char> compressed(input_size * 2 + 1024);
	const int compressed_size = REF_encode(compressed.data(), input, input_size);
	if (compressed_size <= 0) {
		std::cerr << "REF_encode failed\n";
		return 1;
	}

	if (!REF_is(compressed.data())) {
		std::cerr << "REF_is rejected encoded payload\n";
		return 1;
	}

	const int reported_size = REF_size(compressed.data());
	if (reported_size != input_size) {
		std::cerr << "REF_size mismatch: " << reported_size << " != " << input_size << "\n";
		return 1;
	}

	std::vector<unsigned char> decoded(input_size);
	int consumed_size = 0;
	const int decoded_size = REF_decode(decoded.data(), compressed.data(), &consumed_size);
	if (decoded_size != input_size) {
		std::cerr << "REF_decode size mismatch: " << decoded_size << " != " << input_size << "\n";
		return 1;
	}

	if (consumed_size != compressed_size) {
		std::cerr << "compressed byte count mismatch: " << consumed_size << " != "
			<< compressed_size << "\n";
		return 1;
	}

	if (std::memcmp(decoded.data(), input, input_size) != 0) {
		std::cerr << "decoded payload mismatch\n";
		return 1;
	}

	std::cout << "{\"ok\":true,\"codec\":\"RefPack\",\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
