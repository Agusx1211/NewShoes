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
set(WWMATH_DIR "${ZH_CODE_DIR}/Libraries/Source/WWVegas/WWMath")
set(WWLIB_DIR "${ZH_CODE_DIR}/Libraries/Source/WWVegas/WWLib")
set(WASM_SHIMS_DIR "${CMAKE_CURRENT_SOURCE_DIR}/shims")
set(WWVEGAS_PORT_SHIM "${WASM_SHIMS_DIR}/wwvegas_port.h")
set(WWSTRING_PORT_SHIM "${WASM_SHIMS_DIR}/wwstring_port.h")
set(RNDSTRNG_PORT_SHIM "${WASM_SHIMS_DIR}/rndstrng_port.h")

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

add_library(zh_wwlib_random STATIC
  "${WWLIB_DIR}/random.cpp"
)

target_include_directories(zh_wwlib_random PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
)

target_compile_options(zh_wwlib_random PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -Wall
  -Wextra
  -Wno-c++11-narrowing
  -Wno-shift-negative-value
  -Wno-unknown-pragmas
)

add_library(zh_wwlib_base64 STATIC
  "${WWLIB_DIR}/base64.cpp"
)

target_include_directories(zh_wwlib_base64 PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
)

target_compile_options(zh_wwlib_base64 PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -Wall
  -Wextra
  -Wno-unknown-pragmas
)

add_library(zh_wwlib_crc STATIC
  "${WWLIB_DIR}/crc.cpp"
  "${WWLIB_DIR}/realcrc.cpp"
)

target_include_directories(zh_wwlib_crc PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
)

target_compile_options(zh_wwlib_crc PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -Wall
  -Wextra
  -Wno-c++11-narrowing
  -Wno-sign-compare
  -Wno-unknown-pragmas
)

add_library(zh_wwlib_fixed STATIC
  "${WWLIB_DIR}/fixed.cpp"
)

target_include_directories(zh_wwlib_fixed PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
)

target_compile_options(zh_wwlib_fixed PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -Wall
  -Wextra
  -Wno-ignored-qualifiers
  -Wno-unknown-pragmas
)

add_library(zh_wwlib_file_core STATIC
  "${WWLIB_DIR}/buff.cpp"
  "${WWLIB_DIR}/wwfile.cpp"
)

target_include_directories(zh_wwlib_file_core PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
)

target_compile_options(zh_wwlib_file_core PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -Wall
  -Wextra
  -Wno-delete-incomplete
  -Wno-unknown-pragmas
)

add_library(zh_wwlib_ramfile STATIC
  "${WWLIB_DIR}/ramfile.cpp"
)

target_include_directories(zh_wwlib_ramfile PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
)

target_compile_options(zh_wwlib_ramfile PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -Wall
  -Wextra
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_libraries(zh_wwlib_ramfile PUBLIC
  zh_wwlib_file_core
)

add_library(zh_wwlib_string STATIC
  "${WWLIB_DIR}/trim.cpp"
  "${WWLIB_DIR}/wwstring.cpp"
)

target_include_directories(zh_wwlib_string PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
  "${WWDEBUG_DIR}"
)

target_compile_options(zh_wwlib_string PRIVATE
  -include "${WWSTRING_PORT_SHIM}"
  -Wall
  -Wextra
  -Wno-pointer-to-int-cast
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_libraries(zh_wwlib_string PUBLIC
  zh_wwdebug_core
)

add_library(zh_wwlib_utility_core STATIC
  "${WWLIB_DIR}/blowfish.cpp"
  "${WWLIB_DIR}/gcd_lcm.cpp"
  "${WWLIB_DIR}/obscure.cpp"
  "${WWLIB_DIR}/rc4.cpp"
  "${WWLIB_DIR}/rndstrng.cpp"
)

target_include_directories(zh_wwlib_utility_core PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
  "${WWDEBUG_DIR}"
)

target_compile_options(zh_wwlib_utility_core PRIVATE
  -include "${RNDSTRNG_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-c++11-narrowing
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_libraries(zh_wwlib_utility_core PUBLIC
  zh_wwlib_crc
  zh_wwlib_random
  zh_wwlib_string
)

add_library(zh_wwlib_hash STATIC
  "${WWLIB_DIR}/hash.cpp"
)

target_include_directories(zh_wwlib_hash PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
  "${WWDEBUG_DIR}"
)

target_compile_options(zh_wwlib_hash PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -Wall
  -Wextra
  -Wno-c++11-narrowing
  -Wno-unknown-pragmas
)

target_link_libraries(zh_wwlib_hash PUBLIC
  zh_wwlib_crc
  zh_wwdebug_core
)

add_library(zh_wwlib_md5 STATIC
  "${WWLIB_DIR}/md5.cpp"
)

target_include_directories(zh_wwlib_md5 PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
)

target_compile_options(zh_wwlib_md5 PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -Wall
  -Wextra
  -Wno-unknown-pragmas
)

add_library(zh_wwlib_sha STATIC
  "${WWLIB_DIR}/sha.cpp"
)

target_include_directories(zh_wwlib_sha PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
)

target_compile_options(zh_wwlib_sha PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -Wall
  -Wextra
  -Wno-c++11-narrowing
  -Wno-macro-redefined
  -Wno-sign-compare
  -Wno-unknown-pragmas
)

add_library(zh_wwmath_core STATIC
  "${WWMATH_DIR}/pot.cpp"
  "${WWMATH_DIR}/tri.cpp"
  "${WWMATH_DIR}/v3_rnd.cpp"
)

target_include_directories(zh_wwmath_core PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWMATH_DIR}"
  "${WWLIB_DIR}"
)

target_link_libraries(zh_wwmath_core PUBLIC
  zh_wwlib_random
)

target_compile_options(zh_wwmath_core PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-logical-not-parentheses
  -Wno-microsoft-extra-qualification
  -Wno-unknown-pragmas
  -Wno-unused-function
  -Wno-unused-parameter
  -Wno-unused-value
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

add_executable(wwlib-base64-smoke
  tests/wwlib_base64_smoke.cpp
)

set_target_properties(wwlib-base64-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-base64-smoke PRIVATE
  zh_wwlib_base64
)

target_compile_options(wwlib-base64-smoke PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -Wall
  -Wextra
  -Wpedantic
  -Wno-unknown-pragmas
)

target_link_options(wwlib-base64-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  "SHELL:-sASSERTIONS=1"
)

add_executable(wwlib-crc-smoke
  tests/wwlib_crc_smoke.cpp
)

set_target_properties(wwlib-crc-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-crc-smoke PRIVATE
  zh_wwlib_crc
)

target_compile_options(wwlib-crc-smoke PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -Wall
  -Wextra
  -Wpedantic
  -Wno-unknown-pragmas
)

target_link_options(wwlib-crc-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  "SHELL:-sASSERTIONS=1"
)

add_executable(wwlib-fixed-smoke
  tests/wwlib_fixed_smoke.cpp
)

set_target_properties(wwlib-fixed-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-fixed-smoke PRIVATE
  zh_wwlib_fixed
)

target_compile_options(wwlib-fixed-smoke PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -Wall
  -Wextra
  -Wpedantic
  -Wno-ignored-qualifiers
  -Wno-unknown-pragmas
)

target_link_options(wwlib-fixed-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  "SHELL:-sASSERTIONS=1"
)

add_executable(wwlib-file-core-smoke
  tests/wwlib_file_core_smoke.cpp
)

set_target_properties(wwlib-file-core-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-file-core-smoke PRIVATE
  zh_wwlib_file_core
)

target_compile_options(wwlib-file-core-smoke PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -Wall
  -Wextra
  -Wpedantic
  -Wno-unknown-pragmas
)

target_link_options(wwlib-file-core-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  "SHELL:-sASSERTIONS=1"
)

add_executable(wwlib-ramfile-smoke
  tests/wwlib_ramfile_smoke.cpp
)

set_target_properties(wwlib-ramfile-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-ramfile-smoke PRIVATE
  zh_wwlib_ramfile
)

target_compile_options(wwlib-ramfile-smoke PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -Wall
  -Wextra
  -Wpedantic
  -Wno-unknown-pragmas
)

target_link_options(wwlib-ramfile-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  "SHELL:-sASSERTIONS=1"
)

add_executable(wwlib-utility-core-smoke
  tests/wwlib_utility_core_smoke.cpp
)

set_target_properties(wwlib-utility-core-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-utility-core-smoke PRIVATE
  zh_wwlib_utility_core
)

target_compile_options(wwlib-utility-core-smoke PRIVATE
  -include "${RNDSTRNG_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-keyword-macro
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_options(wwlib-utility-core-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  "SHELL:-sASSERTIONS=1"
)

add_executable(wwlib-string-smoke
  tests/wwlib_string_smoke.cpp
)

set_target_properties(wwlib-string-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-string-smoke PRIVATE
  zh_wwlib_string
)

target_compile_options(wwlib-string-smoke PRIVATE
  -include "${WWSTRING_PORT_SHIM}"
  -Wall
  -Wextra
  -Wpedantic
  -Wno-unknown-pragmas
)

target_link_options(wwlib-string-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  "SHELL:-sASSERTIONS=1"
)

add_executable(wwlib-hash-smoke
  tests/wwlib_hash_smoke.cpp
)

set_target_properties(wwlib-hash-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-hash-smoke PRIVATE
  zh_wwlib_hash
)

target_compile_options(wwlib-hash-smoke PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -Wall
  -Wextra
  -Wpedantic
  -Wno-unknown-pragmas
)

target_link_options(wwlib-hash-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  "SHELL:-sASSERTIONS=1"
)

add_executable(wwlib-md5-smoke
  tests/wwlib_md5_smoke.cpp
)

set_target_properties(wwlib-md5-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-md5-smoke PRIVATE
  zh_wwlib_md5
)

target_compile_options(wwlib-md5-smoke PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -Wall
  -Wextra
  -Wpedantic
  -Wno-unknown-pragmas
)

target_link_options(wwlib-md5-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  "SHELL:-sASSERTIONS=1"
)

add_executable(wwlib-sha-smoke
  tests/wwlib_sha_smoke.cpp
)

set_target_properties(wwlib-sha-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-sha-smoke PRIVATE
  zh_wwlib_sha
)

target_compile_options(wwlib-sha-smoke PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -Wall
  -Wextra
  -Wpedantic
  -Wno-unknown-pragmas
)

target_link_options(wwlib-sha-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  "SHELL:-sASSERTIONS=1"
)

add_executable(wwmath-core-smoke
  tests/wwmath_core_smoke.cpp
)

set_target_properties(wwmath-core-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwmath-core-smoke PRIVATE
  zh_wwmath_core
)

target_compile_options(wwmath-core-smoke PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-logical-not-parentheses
  -Wno-microsoft-extra-qualification
  -Wno-unknown-pragmas
  -Wno-unused-value
)

target_link_options(wwmath-core-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  "SHELL:-sASSERTIONS=1"
)
