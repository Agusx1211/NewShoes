#include "MPU.H"

#include <cstdint>
#include <iostream>

namespace {
bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << '\n';
	}
	return condition;
}

std::uint64_t combine_counter(unsigned long high, unsigned long low)
{
	return (static_cast<std::uint64_t>(high) << 32) | static_cast<std::uint64_t>(low);
}
} // namespace

int main()
{
	unsigned long rate_high = 0;
	const unsigned long rate_low = Get_CPU_Rate(rate_high);
	const std::uint64_t rate = combine_counter(rate_high, rate_low);
	if (!expect(rate == 1000000, "Get_CPU_Rate should expose the browser QPC frequency")) {
		return 1;
	}

	unsigned long first_high = 0;
	const unsigned long first_low = Get_CPU_Clock(first_high);
	unsigned long second_high = 0;
	const unsigned long second_low = Get_CPU_Clock(second_high);
	const std::uint64_t first_clock = combine_counter(first_high, first_low);
	const std::uint64_t second_clock = combine_counter(second_high, second_low);
	if (!expect(second_clock >= first_clock, "Get_CPU_Clock should be monotonic")) {
		return 1;
	}

	if (!expect(Get_RDTSC_CPU_Speed() == 0, "Browser RDTSC CPU MHz should be unavailable")) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":\"mpu.cpp\","
		"\"source\":\"GeneralsMD original\","
		"\"rate\":" << rate << ","
		"\"firstClock\":" << first_clock << ","
		"\"secondClock\":" << second_clock << "}\n";
	return 0;
}
