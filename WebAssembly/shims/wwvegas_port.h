#pragma once

#include <stddef.h>
#include <strings.h>

#ifndef __cdecl
#define __cdecl
#endif

#ifndef _OPERATOR_NEW_DEFINED_
#define _OPERATOR_NEW_DEFINED_ 1
#endif

#ifndef TRUE_FALSE_DEFINED
#define TRUE_FALSE_DEFINED 1
#endif

#ifndef stricmp
#define stricmp strcasecmp
#endif

#if !defined(_MSC_VER)
static inline long _lrotl(long value, int shift)
{
	const unsigned int bits = sizeof(unsigned long) * 8U;
	const unsigned int amount = static_cast<unsigned int>(shift) & (bits - 1U);
	const unsigned long input = static_cast<unsigned long>(value);
	if (amount == 0U) {
		return static_cast<long>(input);
	}
	return static_cast<long>((input << amount) | (input >> (bits - amount)));
}
#endif
