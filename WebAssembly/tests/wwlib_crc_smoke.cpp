#include <cstring>
#include <iostream>

#include "crc.h"
#include "realcrc.h"

namespace {
bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}
}

int main()
{
	char standard_vector[] = "123456789";
	const unsigned long standard_length = static_cast<unsigned long>(std::strlen(standard_vector));
	constexpr unsigned long expected_crc32 = 0xCBF43926UL;

	if (!expect(CRC::String(standard_vector) == expected_crc32,
			"CRC::String standard vector mismatch")) {
		return 1;
	}
	if (!expect(CRC_String(standard_vector) == expected_crc32,
			"CRC_String standard vector mismatch")) {
		return 1;
	}
	if (!expect(CRC::Memory(reinterpret_cast<unsigned char *>(standard_vector), standard_length) == expected_crc32,
			"CRC::Memory standard vector mismatch")) {
		return 1;
	}
	if (!expect(CRC_Memory(reinterpret_cast<const unsigned char *>(standard_vector), standard_length) == expected_crc32,
			"CRC_Memory standard vector mismatch")) {
		return 1;
	}

	const unsigned long split_crc = CRC_Memory(
		reinterpret_cast<const unsigned char *>(&standard_vector[4]),
		standard_length - 4,
		CRC_Memory(reinterpret_cast<const unsigned char *>(standard_vector), 4));
	if (!expect(split_crc == expected_crc32, "CRC_Memory split update mismatch")) {
		return 1;
	}

	if (!expect(CRC_Stringi("generalszh") == CRC_String("GENERALSZH"),
			"CRC_Stringi case-insensitive mismatch")) {
		return 1;
	}

	const char engine_data[] = "ZeroHourCRC";
	CRCEngine one_shot;
	const long one_shot_crc = one_shot(engine_data, static_cast<int>(std::strlen(engine_data)));

	CRCEngine bytewise;
	for (const char *cursor = engine_data; *cursor; ++cursor) {
		bytewise(*cursor);
	}
	if (!expect(static_cast<long>(bytewise) == one_shot_crc,
			"CRCEngine bytewise update mismatch")) {
		return 1;
	}

	CRCEngine split_engine;
	split_engine(engine_data, 4);
	split_engine(&engine_data[4], static_cast<int>(std::strlen(engine_data) - 4));
	if (!expect(static_cast<long>(split_engine) == one_shot_crc,
			"CRCEngine split update mismatch")) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":[\"crc.cpp\",\"realcrc.cpp\"],\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
