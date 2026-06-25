#include <algorithm>
#include <array>
#include <cstring>
#include <iostream>

#include "blowfish.h"
#include "gcd_lcm.h"
#include "obscure.h"
#include "rc4.h"
#include "rndstrng.h"

namespace {
bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

template <size_t Size>
bool equal_bytes(
	const std::array<unsigned char, Size> &left,
	const std::array<unsigned char, Size> &right)
{
	return std::equal(left.begin(), left.end(), right.begin());
}

bool is_expected_random_string(const char *value)
{
	return value != nullptr &&
		(std::strcmp(value, "USA") == 0 ||
		 std::strcmp(value, "GLA") == 0 ||
		 std::strcmp(value, "China") == 0);
}
}

int main()
{
	if (!expect(Greatest_Common_Divisor(54, 24) == 6, "GCD vector failed")) {
		return 1;
	}
	if (!expect(Greatest_Common_Divisor(0, 12) == 12, "GCD zero vector failed")) {
		return 1;
	}
	if (!expect(Least_Common_Multiple(21, 6) == 42, "LCM vector failed")) {
		return 1;
	}

	{
		RC4Class rc4;
		const unsigned char key[] = {'K', 'e', 'y'};
		std::array<unsigned char, 9> data = {'P', 'l', 'a', 'i', 'n', 't', 'e', 'x', 't'};
		const std::array<unsigned char, 9> expected = {
			0xbb, 0xf3, 0x16, 0xe8, 0xd9, 0x40, 0xaf, 0x0a, 0xd3
		};
		rc4.Prepare_Key(key, sizeof(key));
		rc4.RC4(data.data(), data.size());
		if (!expect(equal_bytes(data, expected), "RC4 known vector failed")) {
			return 1;
		}

		RC4Class decrypt;
		decrypt.Prepare_Key(key, sizeof(key));
		decrypt.RC4(data.data(), data.size());
		const std::array<unsigned char, 9> plaintext = {
			'P', 'l', 'a', 'i', 'n', 't', 'e', 'x', 't'
		};
		if (!expect(equal_bytes(data, plaintext), "RC4 decrypt round-trip failed")) {
			return 1;
		}
	}

	{
		BlowfishEngine blowfish;
		const std::array<unsigned char, 8> key = {};
		const std::array<unsigned char, 8> plaintext = {};
		const std::array<unsigned char, 8> expected = {
			0x4e, 0xf9, 0x97, 0x45, 0x61, 0x98, 0xdd, 0x78
		};
		std::array<unsigned char, 8> encrypted = {};
		blowfish.Submit_Key(key.data(), key.size());
		if (!expect(blowfish.Encrypt(plaintext.data(), plaintext.size(), encrypted.data()) == 8,
				"Blowfish encrypt length failed")) {
			return 1;
		}
		if (!expect(equal_bytes(encrypted, expected), "Blowfish known vector failed")) {
			return 1;
		}
		std::array<unsigned char, 8> decrypted = {};
		if (!expect(blowfish.Decrypt(encrypted.data(), encrypted.size(), decrypted.data()) == 8,
				"Blowfish decrypt length failed")) {
			return 1;
		}
		if (!expect(equal_bytes(decrypted, plaintext), "Blowfish decrypt round-trip failed")) {
			return 1;
		}
	}

	const long obfuscated = Obfuscate("zero hour");
	if (!expect(Obfuscate(nullptr) == 0, "Obfuscate null handling failed")) {
		return 1;
	}
	if (!expect(obfuscated != 0 && obfuscated == Obfuscate("ZERO HOUR"),
			"Obfuscate case normalization failed")) {
		return 1;
	}
	if (!expect(obfuscated != Obfuscate("generals"), "Obfuscate distinction failed")) {
		return 1;
	}

	RandomStringClass empty_strings;
	if (!expect(empty_strings.Get_String() == nullptr, "RandomString empty result failed")) {
		return 1;
	}

	RandomStringClass strings;
	strings.Add_String("USA");
	strings.Add_String("GLA");
	strings.Add_String("China");
	for (int index = 0; index < 16; ++index) {
		if (!expect(is_expected_random_string(strings.Get_String()),
				"RandomString returned an unexpected value")) {
			return 1;
		}
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":\"blowfish.cpp,gcd_lcm.cpp,obscure.cpp,rc4.cpp,rndstrng.cpp\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
