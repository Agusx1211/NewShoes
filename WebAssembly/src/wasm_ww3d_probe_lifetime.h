#pragma once

#include "statistics.h"
#include "ww3d.h"

inline void wasm_shutdown_ww3d_probe()
{
	// Focused probes own WW3D directly, so mirror W3DDisplay's stats cleanup.
	Debug_Statistics::Shutdown_Statistics();
	WW3D::Shutdown();
}
