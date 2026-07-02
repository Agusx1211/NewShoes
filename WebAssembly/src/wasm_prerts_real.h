// Real-header PreRTS prelude for the wasm build.
//
// Mirrors GeneralsMD/Code/GameEngine/Include/Precompiled/PreRTS.h through the
// browser platform shims (windows.h/mmsystem.h/wwvegas_port.h) but, unlike
// shims/PreRTS.h, lives outside shims/ so every quoted engine include below
// resolves to the REAL GameEngine headers (Common/INI.h, Common/GlobalData.h,
// ...). Used by zh_gameengine_real_lifecycle_runtime, which compiles the
// original GameEngine::init() boot closure.

#pragma once

#ifndef __PRERTS_H__
#define __PRERTS_H__

#define WIN32_LEAN_AND_MEAN

#include <algorithm>
#include <cassert>
#include <cctype>
#include <cmath>
#include <cstdarg>
#include <cstddef>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <map>
#include <new>
#include <string>
#include <strings.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <vector>
#include <cwctype>

#include "windows.h"
#include "mmsystem.h"
#include "wwvegas_port.h"

#ifndef _stricmp
#define _stricmp strcasecmp
#endif

#ifndef stricmp
#define stricmp strcasecmp
#endif

#ifndef strnicmp
#define strnicmp strncasecmp
#endif

#ifndef _vsnprintf
#define _vsnprintf vsnprintf
#endif

#ifndef _isnan
#define _isnan std::isnan
#endif

#ifndef MIN
#define MIN(a, b) (((a) < (b)) ? (a) : (b))
#endif

#ifndef MAX
#define MAX(a, b) (((a) > (b)) ? (a) : (b))
#endif

inline int iswascii(wint_t c)
{
	return c >= 0 && c <= 0x7f;
}

#include "Lib/BaseType.h"
#include "Common/GameType.h"
#include "Common/STLTypedefs.h"
#include "Common/Errors.h"
#include "Common/Debug.h"
#include "Common/AsciiString.h"
#include "Common/UnicodeString.h"
#include "Common/SubsystemInterface.h"
#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/INI.h"
#include "Common/NameKeyGenerator.h"
#include "GameClient/ClientRandomValue.h"
#include "GameLogic/LogicRandomValue.h"

#endif
