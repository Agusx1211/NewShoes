#include <array>
#include <cstring>
#include <iostream>

#include "pk.h"

namespace {
bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

PKey make_key(unsigned long exponent)
{
	PKey key;
	key.Modulus = BigInt(3233UL);
	key.Exponent = BigInt(exponent);
	key.BitPrecision = key.Modulus.BitCount() - 1;
	return key;
}
}

int main()
{
	PKey public_key = make_key(17UL);
	PKey private_key = make_key(2753UL);

	if (!expect(public_key.Plain_Block_Size() == 1 &&
			public_key.Crypt_Block_Size() == 2 &&
			public_key.Block_Count(3) == 3,
			"PKey block sizing failed")) {
		return 1;
	}

	const std::array<unsigned char, 3> plain = {'Z', 'H', '!'};
	std::array<unsigned char, 16> encrypted{};
	std::array<unsigned char, 16> decrypted{};

	const int encrypted_count = public_key.Encrypt(
		plain.data(),
		static_cast<int>(plain.size()),
		encrypted.data());
	if (!expect(encrypted_count == 6, "PKey encrypt length failed")) {
		return 1;
	}

	const int decrypted_count = private_key.Decrypt(
		encrypted.data(),
		encrypted_count,
		decrypted.data());
	if (!expect(decrypted_count == static_cast<int>(plain.size()) &&
			std::memcmp(decrypted.data(), plain.data(), plain.size()) == 0,
			"PKey decrypt round trip failed")) {
		return 1;
	}

	std::array<unsigned char, 128> encoded_modulus{};
	std::array<unsigned char, 128> encoded_exponent{};
	const int modulus_length = public_key.Encode_Modulus(encoded_modulus.data());
	const int exponent_length = public_key.Encode_Exponent(encoded_exponent.data());
	if (!expect(modulus_length > 0 && exponent_length > 0,
			"PKey DER encoding failed")) {
		return 1;
	}

	PKey decoded_public(encoded_exponent.data(), encoded_modulus.data());
	std::array<unsigned char, 16> encrypted_again{};
	const int encrypted_again_count = decoded_public.Encrypt(
		plain.data(),
		static_cast<int>(plain.size()),
		encrypted_again.data());
	if (!expect(encrypted_again_count == encrypted_count &&
			std::memcmp(encrypted_again.data(), encrypted.data(), encrypted_count) == 0,
			"PKey DER decode did not preserve key behavior")) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":\"multiprecision public-key crypto\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
