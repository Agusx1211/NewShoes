#pragma once

#include <stddef.h>
#include <ctype.h>
#include <cwchar>
#include <cwctype>
#include <stdio.h>
#include <string.h>
#include <strings.h>
#include <string>

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

#ifndef _stricmp
#define _stricmp strcasecmp
#endif

#ifndef strcmpi
#define strcmpi strcasecmp
#endif

#ifndef strnicmp
#define strnicmp strncasecmp
#endif

#ifndef _strnicmp
#define _strnicmp strncasecmp
#endif

#ifndef _vsnprintf
#define _vsnprintf vsnprintf
#endif

#ifndef _vsnwprintf
static inline int wwlib_vsnwprintf(wchar_t *buffer, size_t count, const wchar_t *format, va_list args)
{
	if (format == nullptr) {
		return -1;
	}

	std::wstring converted;
	bool needs_conversion = false;
	for (size_t index = 0; format[index] != L'\0'; ++index) {
		if (format[index] != L'%') {
			converted.push_back(format[index]);
			continue;
		}

		converted.push_back(format[index]);
		++index;
		if (format[index] == L'\0') {
			break;
		}
		if (format[index] == L'%') {
			converted.push_back(format[index]);
			continue;
		}

		while (format[index] != L'\0' && wcschr(L"-+ #0", format[index]) != nullptr) {
			converted.push_back(format[index++]);
		}
		while (format[index] != L'\0' && (iswdigit(format[index]) || format[index] == L'*')) {
			converted.push_back(format[index++]);
		}
		if (format[index] == L'.') {
			converted.push_back(format[index++]);
			while (format[index] != L'\0' && (iswdigit(format[index]) || format[index] == L'*')) {
				converted.push_back(format[index++]);
			}
		}

		if (format[index] == L'h' && format[index + 1] == L's') {
			converted.push_back(L's');
			++index;
			needs_conversion = true;
		} else {
			converted.push_back(format[index]);
		}
	}

	return vswprintf(buffer, count, needs_conversion ? converted.c_str() : format, args);
}
#define _vsnwprintf wwlib_vsnwprintf
#endif

#ifndef _snprintf
#define _snprintf snprintf
#endif

#ifndef itoa
static inline char *wwlib_itoa(int value, char *buffer, int radix)
{
	if (buffer == nullptr || radix < 2 || radix > 36) {
		return buffer;
	}

	if (radix == 10) {
		snprintf(buffer, 34, "%d", value);
		return buffer;
	}

	char digits[34];
	unsigned int input = static_cast<unsigned int>(value);
	int index = 0;
	do {
		const unsigned int digit = input % static_cast<unsigned int>(radix);
		digits[index++] = static_cast<char>(digit < 10 ? '0' + digit : 'a' + digit - 10);
		input /= static_cast<unsigned int>(radix);
	} while (input != 0 && index < static_cast<int>(sizeof(digits)));

	int out = 0;
	while (index > 0) {
		buffer[out++] = digits[--index];
	}
	buffer[out] = '\0';
	return buffer;
}
#define itoa wwlib_itoa
#define _itoa wwlib_itoa
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
