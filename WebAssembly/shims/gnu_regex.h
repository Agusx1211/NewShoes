#pragma once

#include <regex.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>

typedef unsigned long reg_syntax_t;

#define RE_CHAR_CLASSES 0x0001
#define RE_CONTEXT_INDEP_ANCHORS 0x0002
#define RE_CONTEXT_INDEP_OPS 0x0004
#define RE_CONTEXT_INVALID_OPS 0x0008
#define RE_INTERVALS 0x0010
#define RE_NO_BK_BRACES 0x0020
#define RE_NO_BK_PARENS 0x0040
#define RE_NO_BK_VBAR 0x0080
#define RE_NO_EMPTY_RANGES 0x0100

static inline reg_syntax_t re_set_syntax(reg_syntax_t syntax)
{
	static reg_syntax_t current_syntax = 0;
	const reg_syntax_t previous_syntax = current_syntax;
	current_syntax = syntax;
	return previous_syntax;
}

static inline const char *re_compile_pattern(const char *pattern, size_t length, regex_t *compiled)
{
	static char error_buffer[128];
	if (pattern == NULL || compiled == NULL) {
		return "missing regex pattern";
	}

	char *terminated_pattern = (char *)malloc(length + 1);
	if (terminated_pattern == NULL) {
		return "out of memory";
	}
	memcpy(terminated_pattern, pattern, length);
	terminated_pattern[length] = '\0';

	const int result = regcomp(compiled, terminated_pattern, REG_EXTENDED);
	free(terminated_pattern);
	if (result == 0) {
		return NULL;
	}

	regerror(result, compiled, error_buffer, sizeof(error_buffer));
	return error_buffer;
}

static inline int re_match(regex_t *compiled, const char *string, size_t length, size_t start, void *)
{
	if (compiled == NULL || string == NULL || start > length) {
		return -2;
	}

	const size_t remaining = length - start;
	char *terminated_string = (char *)malloc(remaining + 1);
	if (terminated_string == NULL) {
		return -2;
	}
	memcpy(terminated_string, string + start, remaining);
	terminated_string[remaining] = '\0';

	regmatch_t match = {};
	const int result = regexec(compiled, terminated_string, 1, &match, 0);
	free(terminated_string);
	if (result == REG_NOMATCH) {
		return -1;
	}
	if (result != 0) {
		return -2;
	}
	if (match.rm_so != 0) {
		return -1;
	}
	return (int)match.rm_eo;
}
