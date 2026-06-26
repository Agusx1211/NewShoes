#pragma once

using GHTTPBool = int;
using GHTTPRequest = int;
using GHTTPResult = int;
using GHTTPCompletedCallback =
	GHTTPBool (*)(GHTTPRequest request, GHTTPResult result, char *buffer, int bufferLen, void *param);

enum
{
	GHTTPFalse = 0,
	GHTTPTrue = 1,
	GHTTPSuccess = 0,
};

static inline void ghttpStartup(void) {}
static inline void ghttpCleanup(void) {}
static inline void ghttpSetProxy(const char *) {}
static inline void ghttpThink(void) {}
static inline const char *ghttpGetHeaders(GHTTPRequest) { return ""; }
static inline GHTTPRequest ghttpGet(const char *, GHTTPBool, GHTTPCompletedCallback, void *) { return 0; }
static inline GHTTPRequest ghttpHead(const char *, GHTTPBool, GHTTPCompletedCallback, void *) { return 0; }
