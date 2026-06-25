#include <iostream>
#include <string>

#include "fixed.h"

namespace {
bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

std::string as_string(const fixed &value)
{
	char buffer[32] = {};
	value.To_ASCII(buffer, sizeof(buffer));
	return buffer;
}
}

int main()
{
	if (!expect(as_string(fixed(1, 2)) == "0.5", "fraction constructor formatting failed")) {
		return 1;
	}
	if (!expect(as_string(fixed("1.25")) == "1.25", "decimal string parsing failed")) {
		return 1;
	}
	if (!expect(as_string(fixed(".25")) == "0.25", "leading-decimal parsing failed")) {
		return 1;
	}
	if (!expect(as_string(fixed("150%")) == "1.5", "percentage parsing failed")) {
		return 1;
	}

	const fixed one_and_half("1.5");
	const fixed two(2);
	const fixed three = one_and_half * two;
	if (!expect(as_string(three) == "3", "fixed multiplication failed")) {
		return 1;
	}

	fixed accumulator("0.75");
	accumulator += fixed::_1_4;
	if (!expect(as_string(accumulator) == "1", "fixed addition or constant failed")) {
		return 1;
	}
	accumulator -= fixed::_1_2;
	if (!expect(as_string(accumulator) == "0.5", "fixed subtraction or constant failed")) {
		return 1;
	}

	fixed rounded("1.5");
	if (!expect(static_cast<unsigned>(rounded) == 2, "fixed unsigned conversion did not round")) {
		return 1;
	}

	fixed saturating("3.5");
	saturating.Saturate(2);
	if (!expect(as_string(saturating) == "2", "fixed integer saturation failed")) {
		return 1;
	}

	fixed inverse(4);
	inverse.Inverse();
	if (!expect(as_string(inverse) == "0.25", "fixed inverse failed")) {
		return 1;
	}

	char short_buffer[3] = {};
	const int written = fixed("12.5").To_ASCII(short_buffer, sizeof(short_buffer));
	if (!expect(written == 2 && std::string(short_buffer, sizeof(short_buffer)) == "12.",
			"fixed short-buffer formatting failed")) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"WWLib\","
		"\"compiled\":\"fixed.cpp\",\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
