#pragma once

#include <stddef.h>
#include <ctype.h>
#include <stdio.h>
#include <string.h>
#include <strings.h>

#ifndef __cdecl
#define __cdecl
#endif

#ifndef _cdecl
#define _cdecl
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

#ifndef _vsnprintf
#define _vsnprintf vsnprintf
#endif

#if !defined(_MSC_VER)
static inline char *wwlib_strupr(char *text)
{
	if (text == NULL) {
		return NULL;
	}
	for (char *cursor = text; *cursor != '\0'; ++cursor) {
		*cursor = static_cast<char>(toupper(static_cast<unsigned char>(*cursor)));
	}
	return text;
}

static inline char *wwlib_strrev(char *text)
{
	if (text == NULL) {
		return NULL;
	}
	char *left = text;
	char *right = text + strlen(text);
	if (left == right) {
		return text;
	}
	--right;
	while (left < right) {
		const char value = *left;
		*left++ = *right;
		*right-- = value;
	}
	return text;
}

#ifndef strupr
#define strupr wwlib_strupr
#endif

#ifndef strrev
#define strrev wwlib_strrev
#endif
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
