cmake_minimum_required(VERSION 3.16)

project(CnCGeneralsZeroHourWasmPort LANGUAGES CXX)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "Configure this target with emcmake cmake from Emscripten.")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/dist")

set(ZH_CODE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../GeneralsMD/Code")
set(COMPRESSION_EAC_DIR "${ZH_CODE_DIR}/Libraries/Source/Compression/EAC")
set(COMPRESSION_EAC_PORT_SHIM "${CMAKE_CURRENT_SOURCE_DIR}/shims/compression_eac_port.h")
set(WWDEBUG_DIR "${ZH_CODE_DIR}/Libraries/Source/WWVegas/WWDebug")
set(WASM_SHIMS_DIR "${CMAKE_CURRENT_SOURCE_DIR}/shims")

add_library(zh_compression_eac STATIC
  "${COMPRESSION_EAC_DIR}/btreeabout.cpp"
  "${COMPRESSION_EAC_DIR}/btreedecode.cpp"
  "${COMPRESSION_EAC_DIR}/btreeencode.cpp"
  "${COMPRESSION_EAC_DIR}/huffabout.cpp"
  "${COMPRESSION_EAC_DIR}/huffdecode.cpp"
  "${COMPRESSION_EAC_DIR}/huffencode.cpp"
  "${COMPRESSION_EAC_DIR}/refabout.cpp"
  "${COMPRESSION_EAC_DIR}/refdecode.cpp"
  "${COMPRESSION_EAC_DIR}/refencode.cpp"
)

target_include_directories(zh_compression_eac PUBLIC
  "${COMPRESSION_EAC_DIR}"
)

target_compile_options(zh_compression_eac PRIVATE
  -include "${COMPRESSION_EAC_PORT_SHIM}"
  -Wall
  -Wextra
  -Wpedantic
  -Wno-misleading-indentation
  -Wno-unused-but-set-variable
  -Wno-unused-parameter
)

add_library(zh_wwdebug_core STATIC
  "${WWDEBUG_DIR}/wwdebug.cpp"
)

target_include_directories(zh_wwdebug_core PUBLIC
  "${WWDEBUG_DIR}"
)

target_include_directories(zh_wwdebug_core PRIVATE
  "${WASM_SHIMS_DIR}"
)

target_compile_definitions(zh_wwdebug_core PUBLIC
  WWDEBUG=1
)

target_compile_options(zh_wwdebug_core PRIVATE
  -Wall
  -Wextra
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

add_executable(cnc-port
  src/wasm_port_entry.cpp
)

set_target_properties(cnc-port PROPERTIES
  OUTPUT_NAME "cnc-port"
  SUFFIX ".js"
)

target_compile_options(cnc-port PRIVATE
  -Wall
  -Wextra
  -Wpedantic
)

target_link_options(cnc-port PRIVATE
  "SHELL:--no-entry"
  "SHELL:-sMODULARIZE=1"
  "SHELL:-sEXPORT_ES6=1"
  "SHELL:-sEXPORT_NAME=createCncPortModule"
  "SHELL:-sENVIRONMENT=web,worker"
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sMAXIMUM_MEMORY=2147483648"
  "SHELL:-sTOTAL_STACK=1048576"
  "SHELL:-sASSERTIONS=1"
  "SHELL:-sEXPORTED_FUNCTIONS=['_cnc_port_boot','_cnc_port_frame','_cnc_port_state']"
  "SHELL:-sEXPORTED_RUNTIME_METHODS=['cwrap']"
)

add_executable(compression-eac-smoke
  tests/compression_eac_smoke.cpp
)

set_target_properties(compression-eac-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(compression-eac-smoke PRIVATE
  zh_compression_eac
)

target_compile_options(compression-eac-smoke PRIVATE
  -include "${COMPRESSION_EAC_PORT_SHIM}"
  -Wall
  -Wextra
  -Wpedantic
)

target_link_options(compression-eac-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  "SHELL:-sASSERTIONS=1"
)

add_executable(wwdebug-core-smoke
  tests/wwdebug_core_smoke.cpp
)

set_target_properties(wwdebug-core-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwdebug-core-smoke PRIVATE
  zh_wwdebug_core
)

target_compile_options(wwdebug-core-smoke PRIVATE
  -Wall
  -Wextra
  -Wpedantic
)

target_link_options(wwdebug-core-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  "SHELL:-sASSERTIONS=1"
)
