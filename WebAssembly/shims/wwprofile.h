#pragma once

#include_next "wwprofile.h"

// wwprofile.cpp depends on a missing fastallocator.h in this source snapshot.
// Keep declarations visible while disabling scope timers for current wasm builds.
#ifdef WWPROFILE
#undef WWPROFILE
#endif

#ifdef WWROOTPROFILE
#undef WWROOTPROFILE
#endif

#ifdef WWTIMEIT
#undef WWTIMEIT
#endif

#define WWPROFILE(name)
#define WWROOTPROFILE(name)
#define WWTIMEIT(name)
