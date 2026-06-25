#pragma once

#include <stddef.h>
#include <ctype.h>
#include <cwchar>
#include <cwctype>
#include <stdio.h>
#include <string.h>
#include <strings.h>

typedef signed long long sint64;

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

#ifndef strcmpi
#define strcmpi strcasecmp
#endif

#ifndef _vsnprintf
#define _vsnprintf vsnprintf
#endif

#ifndef _vsnwprintf
#define _vsnwprintf vswprintf
#endif

#ifndef _snprintf
#define _snprintf snprintf
#endif

static inline int wwlib_wcsicmp(const wchar_t *left, const wchar_t *right)
{
	if (left == nullptr && right == nullptr) {
		return 0;
	}
	if (left == nullptr) {
		return -1;
	}
	if (right == nullptr) {
		return 1;
	}
	while (*left != L'\0' && *right != L'\0') {
		const wchar_t lvalue = static_cast<wchar_t>(std::towlower(*left));
		const wchar_t rvalue = static_cast<wchar_t>(std::towlower(*right));
		if (lvalue != rvalue) {
			return lvalue < rvalue ? -1 : 1;
		}
		++left;
		++right;
	}
	if (*left == *right) {
		return 0;
	}
	return *left == L'\0' ? -1 : 1;
}

#ifndef _wcsicmp
#define _wcsicmp wwlib_wcsicmp
#endif

static inline void OutputDebugString(const char *message)
{
	if (message != nullptr) {
		fputs(message, stderr);
	}
}

#ifndef CP_ACP
#define CP_ACP 0
#endif

static inline int MultiByteToWideChar(
	unsigned int,
	unsigned long,
	const char *source,
	int source_len,
	wchar_t *dest,
	int dest_len)
{
	if (source == nullptr) {
		return 0;
	}

	const bool include_null = source_len == -1;
	const int input_len = include_null ? static_cast<int>(strlen(source)) + 1 : source_len;
	if (dest == nullptr || dest_len == 0) {
		return input_len;
	}

	const int count = input_len < dest_len ? input_len : dest_len;
	for (int index = 0; index < count; ++index) {
		dest[index] = static_cast<unsigned char>(source[index]);
	}
	return count;
}

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

static inline char *wwlib_strlwr(char *text)
{
	if (text == NULL) {
		return NULL;
	}
	for (char *cursor = text; *cursor != '\0'; ++cursor) {
		*cursor = static_cast<char>(tolower(static_cast<unsigned char>(*cursor)));
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

#ifndef strlwr
#define strlwr wwlib_strlwr
#endif

#ifndef _strlwr
#define _strlwr wwlib_strlwr
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
