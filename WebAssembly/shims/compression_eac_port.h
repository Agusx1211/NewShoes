#pragma once

#include <cstdlib>

// The EAC codex headers include gimex.h only for small utility helpers. That
// header contains legacy declarations that do not parse cleanly under clang, so
// provide the required helpers here and skip the unused GIMEX API surface.
#ifndef __GIMEX_H
#define __GIMEX_H 1
#endif

#ifndef GCALL
#define GCALL
#endif

#ifndef galloc
#define galloc std::malloc
#endif

#ifndef gfree
#define gfree std::free
#endif

static inline unsigned int ggetm(const void *src, int bytes)
{
	const auto *data = static_cast<const unsigned char *>(src);
	if (bytes == 1) {
		return data[0];
	}
	if (bytes == 2) {
		return (static_cast<unsigned int>(data[0]) << 8) |
			static_cast<unsigned int>(data[1]);
	}
	if (bytes == 3) {
		return (static_cast<unsigned int>(data[0]) << 16) |
			(static_cast<unsigned int>(data[1]) << 8) |
			static_cast<unsigned int>(data[2]);
	}
	if (bytes == 4) {
		return (static_cast<unsigned int>(data[0]) << 24) |
			(static_cast<unsigned int>(data[1]) << 16) |
			(static_cast<unsigned int>(data[2]) << 8) |
			static_cast<unsigned int>(data[3]);
	}
	return 0;
}

static inline void gputm(void *dst, unsigned int value, int bytes)
{
	auto *data = static_cast<unsigned char *>(dst);
	if (bytes == 1) {
		data[0] = static_cast<unsigned char>(value);
	} else if (bytes == 2) {
		data[0] = static_cast<unsigned char>(value >> 8);
		data[1] = static_cast<unsigned char>(value);
	} else if (bytes == 3) {
		data[0] = static_cast<unsigned char>(value >> 16);
		data[1] = static_cast<unsigned char>(value >> 8);
		data[2] = static_cast<unsigned char>(value);
	} else if (bytes == 4) {
		data[0] = static_cast<unsigned char>(value >> 24);
		data[1] = static_cast<unsigned char>(value >> 16);
		data[2] = static_cast<unsigned char>(value >> 8);
		data[3] = static_cast<unsigned char>(value);
	}
}
