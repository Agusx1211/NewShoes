#pragma once

// The original Xfer interface is layout-compatible with the wasm build, and
// the real implementations (Common/System/Xfer.cpp / XferCRC.cpp) are linked
// into the runtime.  Re-declaring the class here forked the vtable layout
// between shim-including and real-header translation units, which trapped at
// runtime ("function signature mismatch") the moment both worlds exchanged an
// Xfer pointer, so this shim now defers to the original header.
#include_next "Common/Xfer.h"
