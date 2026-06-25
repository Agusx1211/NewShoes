#pragma once

#include <cstddef>
#include <cstring>

static inline int _mbsnccnt(const unsigned char *string, std::size_t byte_count)
{
	if (string == nullptr) {
		return 0;
	}

	const std::size_t length = std::strlen(reinterpret_cast<const char *>(string));
	const std::size_t count = length < byte_count ? length : byte_count;
	return static_cast<int>(count);
}
