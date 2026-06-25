#include <algorithm>
#include <array>
#include <cstring>
#include <iostream>

#include "argv.h"
#include "blowfish.h"
#include "_timer.h"
#include "gcd_lcm.h"
#include "hsv.h"
#include "obscure.h"
#include "palette.h"
#include "rc4.h"
#include "rgb.h"
#include "rndstrng.h"
#include "rle.h"
#include "sampler.h"
#include "srandom.h"
#include "stimer.h"
#include "strtok_r.h"

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

	{
		char command_line[] = "-Mode skirmish -Player China \"loose argument\" -Flag";
		if (!expect(ArgvClass::Init(command_line, nullptr) == 6,
				"ArgvClass Init count failed")) {
			return 1;
		}

		ArgvClass args(false, false);
		bool value_in_next = false;
		const char *mode_value = args.Find_Value("-mode");
		if (!expect(mode_value != nullptr && std::strcmp(mode_value, "skirmish") == 0,
				"ArgvClass case-insensitive value lookup failed")) {
			ArgvClass::Free();
			return 1;
		}
		const char *player = args.Find("-player");
		const char *player_value = args.Get_Cur_Value(7, &value_in_next);
		if (!expect(player != nullptr &&
				player_value != nullptr &&
				std::strcmp(player_value, "China") == 0 &&
				value_in_next,
				"ArgvClass next-argument value extraction failed")) {
			ArgvClass::Free();
			return 1;
		}
		args.Update_Value("-Player", "GLA");
		if (!expect(std::strcmp(args.Find_Value("-player"), "GLA") == 0,
				"ArgvClass Update_Value failed")) {
			ArgvClass::Free();
			return 1;
		}
		args.Add_Value("-RemoveMe", "1");
		if (!expect(args.Remove_Value("-removeme") && args.Find("-removeme") == nullptr,
				"ArgvClass Remove_Value failed")) {
			ArgvClass::Free();
			return 1;
		}
		ArgvClass::Free();
	}

	{
		SecureRandomClass secure;
		unsigned char extra_seed[] = {
			0x43, 0x6e, 0x43, 0x5f, 0x5a, 0x48, 0x5f, 0x77,
			0x61, 0x73, 0x6d, 0x5f, 0x73, 0x65, 0x65, 0x64
		};
		secure.Add_Seeds(extra_seed, sizeof(extra_seed));

		std::array<unsigned long, 8> values = {};
		bool any_difference = false;
		for (size_t index = 0; index < values.size(); ++index) {
			values[index] = secure.Randval();
			any_difference = any_difference || values[index] != values[0];
		}
		if (!expect(any_difference, "SecureRandom output did not vary")) {
			return 1;
		}
	}

	{
		const std::array<unsigned char, 10> source = {
			1, 0, 0, 0, 2, 3, 0, 4, 0, 0
		};
		RLEEngine rle;
		std::array<unsigned char, 32> compressed = {};
		std::array<unsigned char, source.size()> decompressed = {};
		const int compressed_length =
			rle.Compress(source.data(), compressed.data(), static_cast<int>(source.size()));
		if (!expect(compressed_length > 0 &&
				rle.Decompress(compressed.data(), decompressed.data(), compressed_length) ==
					static_cast<int>(source.size()) &&
				decompressed == source,
				"RLE round-trip failed")) {
			return 1;
		}

		std::array<unsigned char, 40> line_compressed = {};
		decompressed.fill(0xff);
		const int line_length =
			rle.Line_Compress(source.data(), line_compressed.data(), static_cast<int>(source.size()));
		if (!expect(line_length == compressed_length + static_cast<int>(sizeof(unsigned short)) &&
				rle.Line_Decompress(line_compressed.data(), decompressed.data()) ==
					static_cast<int>(source.size()) &&
				decompressed == source,
				"RLE line round-trip failed")) {
			return 1;
		}
	}

	{
		RGBClass color(10, 20, 30);
		color.Adjust(128, RGBClass(255, 255, 255));
		if (!expect(color.Get_Red() == 132 &&
				color.Get_Green() == 137 &&
				color.Get_Blue() == 142,
				"RGB adjustment failed")) {
			return 1;
		}

		const RGBClass red(255, 0, 0);
		const HSVClass red_hsv = red;
		const RGBClass red_round_trip = red_hsv;
		if (!expect(red_round_trip.Difference(red) == 0, "HSV/RGB round-trip failed")) {
			return 1;
		}

		PaletteClass palette(RGBClass(0, 0, 0));
		palette[7] = RGBClass(130, 140, 150);
		if (!expect(palette.Closest_Color(RGBClass(128, 139, 151)) == 7,
				"Palette closest color failed")) {
			return 1;
		}
	}

	{
		RegularSamplingClass regular(2, 3);
		std::array<float, 2> sample = {};
		regular.Sample(sample.data());
		if (!expect(sample[0] == 0.0f && sample[1] == 0.0f,
				"RegularSampling first sample failed")) {
			return 1;
		}
		regular.Sample(sample.data());
		if (!expect(sample[0] == 0.5f && sample[1] == 0.0f,
				"RegularSampling second sample failed")) {
			return 1;
		}

		QMCSamplingClass qmc(2);
		qmc.Set_Offset(1);
		qmc.Sample(sample.data());
		if (!expect(sample[0] > 0.49f && sample[0] < 0.51f &&
				sample[1] > 0.32f && sample[1] < 0.34f,
				"QMCSampling Halton sample failed")) {
			return 1;
		}

		RandomSamplingClass random(3);
		std::array<float, 3> random_sample = {};
		random.Sample(random_sample.data());
		if (!expect(random_sample[0] >= 0.0f && random_sample[0] <= 1.0f &&
				random_sample[1] >= 0.0f && random_sample[1] <= 1.0f &&
				random_sample[2] >= 0.0f && random_sample[2] <= 1.0f,
				"RandomSampling bounds failed")) {
			return 1;
		}
	}

	{
		char tokens[] = "USA,,GLA;China";
		char *cursor = nullptr;
		const char *first = strtok_r(tokens, ",;", &cursor);
		const char *second = strtok_r(nullptr, ",;", &cursor);
		const char *third = strtok_r(nullptr, ",;", &cursor);
		if (!expect(first != nullptr && std::strcmp(first, "USA") == 0 &&
				second != nullptr && std::strcmp(second, "GLA") == 0 &&
				third != nullptr && std::strcmp(third, "China") == 0 &&
				strtok_r(nullptr, ",;", &cursor) == nullptr,
				"strtok_r tokenization failed")) {
			return 1;
		}
	}

	{
		SystemTimerClass timer;
		if (!expect(timer() >= 0 && static_cast<long>(timer) >= 0,
				"SystemTimerClass tick failed")) {
			return 1;
		}
		if (!expect(FrameTimer.Value() >= 0 &&
				static_cast<int>(TickCount) >= 0 &&
				TickCount.Is_Active(),
				"WWLib timer globals failed")) {
			return 1;
		}
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":\"argv.cpp,blowfish.cpp,gcd_lcm.cpp,hsv.cpp,obscure.cpp,"
		"palette.cpp,rc4.cpp,rgb.cpp,rndstrng.cpp,rle.cpp,sampler.cpp,srandom.cpp,"
		"_timer.cpp,stimer.cpp,strtok_r.cpp\","
		"\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
