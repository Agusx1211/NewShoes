#pragma once

#include <cstdio>
#include <cstring>
#include <strings.h>

#include "windows.h"

using TCHAR = char;

#ifndef _T
#define _T(value) value
#endif

#ifndef _TEXT
#define _TEXT(value) value
#endif

#define _tcsclen std::strlen
#define _tcscmp std::strcmp
#define _tcscpy std::strcpy
#define _tcsicmp strcasecmp
#define _tcslen std::strlen
