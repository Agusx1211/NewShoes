cmake_minimum_required(VERSION 3.16)

project(CnCGeneralsZeroHourWasmPort LANGUAGES CXX)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "Configure this target with emcmake cmake from Emscripten.")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CNC_DIST_DIR "dist" CACHE STRING "dist dir for wasm artifacts")
option(CNC_WASM_NATIVE_EXCEPTIONS "Use native WebAssembly exception handling instead of Emscripten JS exception catching" OFF)
# P0 engine-thread spike (owner-directed 2026-07-10; IDEAS.md "the browser as
# a 2003 PC"): build cnc-port with pthreads so the engine can run on its own
# thread. OFF by default — the default single-threaded build must stay
# byte-identical. Always use a separate build dir for the threaded variant
# (tools/build_wasm.sh with CNC_PORT_THREADS=1 does this): -pthread is applied
# globally because every static lib cnc-port links must be compiled with
# atomics+bulk-memory or wasm-ld refuses to link --shared-memory objects.
option(CNC_PORT_THREADS "Build cnc-port with pthreads (engine-on-its-own-thread P0 spike)" OFF)
if(CNC_PORT_THREADS)
  add_compile_options(-pthread)
  add_link_options(-pthread)
endif()
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/${CNC_DIST_DIR}")

set(CNC_EXCEPTION_COMPILE_OPTION "-fexceptions")
set(CNC_EXCEPTION_LINK_OPTION "SHELL:-sDISABLE_EXCEPTION_CATCHING=0")
if(CNC_WASM_NATIVE_EXCEPTIONS)
  set(CNC_EXCEPTION_COMPILE_OPTION "-fwasm-exceptions")
  set(CNC_EXCEPTION_LINK_OPTION "SHELL:-fwasm-exceptions")
  add_compile_options(-fwasm-exceptions)
endif()

set(CNC_ASSERTIONS_LINK_OPTION "SHELL:-sASSERTIONS=1")
if(CMAKE_BUILD_TYPE STREQUAL "Release")
  set(CNC_ASSERTIONS_LINK_OPTION "SHELL:-sASSERTIONS=0")
endif()

set(CNC_ENGINE_DEBUG_COMPILE_DEFINITIONS
  ALLOW_DEBUG_UTILS=1
  DEBUG_LOGGING=1
  DISABLE_DEBUG_CRASHING=1
  DISABLE_DEBUG_STACKTRACE=1
  DISABLE_DEBUG_PROFILE=1
)
set(CNC_WWDEBUG_COMPILE_DEFINITIONS WWDEBUG=1)
if(CMAKE_BUILD_TYPE STREQUAL "Release")
  set(CNC_ENGINE_DEBUG_COMPILE_DEFINITIONS
    ALLOW_DEBUG_UTILS=1
    DISABLE_DEBUG_LOGGING=1
    DISABLE_DEBUG_CRASHING=1
    DISABLE_DEBUG_STACKTRACE=1
    DISABLE_DEBUG_PROFILE=1
  )
  set(CNC_WWDEBUG_COMPILE_DEFINITIONS)
endif()

set(ZH_CODE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../GeneralsMD/Code")
set(ZH_LIB_INCLUDE_DIR "${ZH_CODE_DIR}/Libraries/Include")
set(COMPRESSION_DIR "${ZH_CODE_DIR}/Libraries/Source/Compression")
set(COMPRESSION_EAC_DIR "${COMPRESSION_DIR}/EAC")
set(COMPRESSION_EAC_PORT_SHIM "${CMAKE_CURRENT_SOURCE_DIR}/shims/compression_eac_port.h")
set(WWDEBUG_DIR "${ZH_CODE_DIR}/Libraries/Source/WWVegas/WWDebug")
set(WWVEGAS_DIR "${ZH_CODE_DIR}/Libraries/Source/WWVegas")
set(WWMATH_DIR "${ZH_CODE_DIR}/Libraries/Source/WWVegas/WWMath")
set(WWLIB_DIR "${ZH_CODE_DIR}/Libraries/Source/WWVegas/WWLib")
set(WWSAVELOAD_DIR "${ZH_CODE_DIR}/Libraries/Source/WWVegas/WWSaveLoad")
set(WWUTIL_DIR "${ZH_CODE_DIR}/Libraries/Source/WWVegas/Wwutil")
set(WWDOWNLOAD_DIR "${ZH_CODE_DIR}/Libraries/Source/WWVegas/WWDownload")
set(WWSHADE_DIR "${ZH_CODE_DIR}/Libraries/Source/WWVegas/wwshade")
set(WWAUDIO_DIR "${ZH_CODE_DIR}/Libraries/Source/WWVegas/WWAudio")
set(MAIN_DIR "${ZH_CODE_DIR}/Main")
set(GAMEENGINE_DIR "${ZH_CODE_DIR}/GameEngine")
set(GAMEENGINE_INCLUDE_DIR "${GAMEENGINE_DIR}/Include")
set(GAMEENGINE_COMMON_DIR "${GAMEENGINE_DIR}/Source/Common")
set(GAMEENGINE_GAMECLIENT_DIR "${GAMEENGINE_DIR}/Source/GameClient")
set(GAMEENGINE_GAMELOGIC_DIR "${GAMEENGINE_DIR}/Source/GameLogic")
set(GAMEENGINE_GAMENETWORK_DIR "${GAMEENGINE_DIR}/Source/GameNetwork")
set(GAMEENGINE_DEVICE_DIR "${ZH_CODE_DIR}/GameEngineDevice")
set(GAMEENGINE_DEVICE_INCLUDE_DIR "${GAMEENGINE_DEVICE_DIR}/Include")
set(WASM_SHIMS_DIR "${CMAKE_CURRENT_SOURCE_DIR}/shims")
set(WIN32_GAMEENGINE_SHIMS_DIR "${WASM_SHIMS_DIR}/win32_gameengine")
set(WINMAIN_WNDPROC_SHIMS_DIR "${WASM_SHIMS_DIR}/winmain_wndproc")
set(WWVEGAS_PORT_SHIM "${WASM_SHIMS_DIR}/wwvegas_port.h")
set(WWVEGAS_MUTEX_PORT_SHIM "${WASM_SHIMS_DIR}/wwvegas_mutex_port.h")
set(WWSTRING_PORT_SHIM "${WASM_SHIMS_DIR}/wwstring_port.h")
set(RNDSTRNG_PORT_SHIM "${WASM_SHIMS_DIR}/rndstrng_port.h")

find_program(NODE_EXECUTABLE NAMES node nodejs REQUIRED)

add_library(zh_browser_d3d8 STATIC
  src/wasm_d3d8_shim.cpp
)

target_include_directories(zh_browser_d3d8 PUBLIC
  "${CMAKE_CURRENT_SOURCE_DIR}/src"
  "${WASM_SHIMS_DIR}"
)

target_compile_options(zh_browser_d3d8 PRIVATE
  -Wall
  -Wextra
  -Wpedantic
  -Wno-unused-parameter
)

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

add_library(zh_compression_manager STATIC
  "${COMPRESSION_DIR}/CompressionManager.cpp"
)

target_include_directories(zh_compression_manager PUBLIC
  "${WASM_SHIMS_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_options(zh_compression_manager PRIVATE
  -include "${COMPRESSION_EAC_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-switch
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_libraries(zh_compression_manager PUBLIC
  zh_compression_eac
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
  ${CNC_WWDEBUG_COMPILE_DEFINITIONS}
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
  "${WWLIB_DIR}/argv.cpp"
  "${WWLIB_DIR}/blowfish.cpp"
  "${WWLIB_DIR}/gcd_lcm.cpp"
  "${WWLIB_DIR}/hsv.cpp"
  "${WWLIB_DIR}/obscure.cpp"
  "${WWLIB_DIR}/palette.cpp"
  "${WWLIB_DIR}/rc4.cpp"
  "${WWLIB_DIR}/rgb.cpp"
  "${WWLIB_DIR}/rndstrng.cpp"
  "${WWLIB_DIR}/rle.cpp"
  "${WWLIB_DIR}/sampler.cpp"
  "${WWLIB_DIR}/srandom.cpp"
  "${WWLIB_DIR}/strtok_r.cpp"
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
  zh_wwlib_sha
  zh_wwlib_string
)

add_library(zh_wwlib_stream_core STATIC
  "${WWLIB_DIR}/b64pipe.cpp"
  "${WWLIB_DIR}/b64straw.cpp"
  "${WWLIB_DIR}/blowpipe.cpp"
  "${WWLIB_DIR}/blwstraw.cpp"
  "${WWLIB_DIR}/crcpipe.cpp"
  "${WWLIB_DIR}/crcstraw.cpp"
  "${WWLIB_DIR}/cstraw.cpp"
  "${WWLIB_DIR}/jshell.cpp"
  "${WWLIB_DIR}/lcw.cpp"
  "${WWLIB_DIR}/lcwpipe.cpp"
  "${WWLIB_DIR}/load.cpp"
  "${WWLIB_DIR}/pipe.cpp"
  "${WWLIB_DIR}/rndstraw.cpp"
  "${WWLIB_DIR}/shapipe.cpp"
  "${WWLIB_DIR}/shastraw.cpp"
  "${WWLIB_DIR}/straw.cpp"
  "${WWLIB_DIR}/vector.cpp"
)

target_include_directories(zh_wwlib_stream_core PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
)

target_compile_options(zh_wwlib_stream_core PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-c++11-narrowing
  -Wno-sign-compare
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_libraries(zh_wwlib_stream_core PUBLIC
  zh_wwlib_base64
  zh_wwlib_crc
  zh_wwlib_file_core
  zh_wwlib_sha
  zh_wwlib_utility_core
)

add_library(zh_wwlib_lzo STATIC
  "${WWLIB_DIR}/lzo.cpp"
  "${WWLIB_DIR}/lzo1x_c.cpp"
  "${WWLIB_DIR}/lzo1x_d.cpp"
  "${WWLIB_DIR}/lzopipe.cpp"
  "${WWLIB_DIR}/lzostraw.cpp"
)

target_include_directories(zh_wwlib_lzo PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
  "${WWDEBUG_DIR}"
)

target_compile_options(zh_wwlib_lzo PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-c++11-narrowing
  -Wno-register
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_libraries(zh_wwlib_lzo PUBLIC
  zh_wwlib_stream_core
)

add_library(zh_wwlib_public_key STATIC
  "${WWLIB_DIR}/int.cpp"
  "${WWLIB_DIR}/mpmath.cpp"
  "${WWLIB_DIR}/pk.cpp"
  "${WWLIB_DIR}/pkpipe.cpp"
  "${WWLIB_DIR}/pkstraw.cpp"
)

target_include_directories(zh_wwlib_public_key PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
)

target_compile_options(zh_wwlib_public_key PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-c++11-narrowing
  -Wno-register
  -Wno-undefined-var-template
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_libraries(zh_wwlib_public_key PUBLIC
  zh_wwlib_stream_core
)

add_library(zh_wwlib_file_ini STATIC
  "${WWLIB_DIR}/bfiofile.cpp"
  "${WWLIB_DIR}/bufffile.cpp"
  "${WWLIB_DIR}/chunkio.cpp"
  "${WWLIB_DIR}/ffactory.cpp"
  "${WWLIB_DIR}/ini.cpp"
  "${WWLIB_DIR}/nstrdup.cpp"
  "${WWLIB_DIR}/rawfile.cpp"
  "${WWLIB_DIR}/readline.cpp"
  "${WWLIB_DIR}/tagblock.cpp"
  "${WWLIB_DIR}/textfile.cpp"
  "${WWLIB_DIR}/widestring.cpp"
  "${WWLIB_DIR}/xpipe.cpp"
  "${WWLIB_DIR}/xstraw.cpp"
)

target_include_directories(zh_wwlib_file_ini PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
  "${WWDEBUG_DIR}"
)

target_compile_definitions(zh_wwlib_file_ini PRIVATE
  _UNIX
)

target_compile_options(zh_wwlib_file_ini PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-c++11-narrowing
  -Wno-delete-incomplete
  -Wno-format
  -Wno-register
  -Wno-sign-compare
  -Wno-unknown-pragmas
  -Wno-unused-but-set-variable
  -Wno-unused-parameter
  -Wno-writable-strings
)

target_link_libraries(zh_wwlib_file_ini PUBLIC
  zh_wwlib_public_key
  zh_wwlib_ramfile
  zh_wwlib_stream_core
)

add_library(zh_wwlib_mixfile STATIC
  "${WWLIB_DIR}/mixfile.cpp"
)

target_include_directories(zh_wwlib_mixfile PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
  "${WWDEBUG_DIR}"
)

target_compile_definitions(zh_wwlib_mixfile PRIVATE
  _UNIX
)

target_compile_options(zh_wwlib_mixfile PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-c++11-narrowing
  -Wno-register
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

target_link_libraries(zh_wwlib_mixfile PUBLIC
  zh_wwlib_file_ini
)

add_library(zh_wwlib_platform_compat STATIC
  "${WWLIB_DIR}/data.cpp"
  "${WWLIB_DIR}/rcfile.cpp"
  "${WWLIB_DIR}/registry.cpp"
)

target_include_directories(zh_wwlib_platform_compat PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
  "${WWDEBUG_DIR}"
)

target_compile_definitions(zh_wwlib_platform_compat PRIVATE
  _UNIX
)

target_compile_options(zh_wwlib_platform_compat PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-c++11-narrowing
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_libraries(zh_wwlib_platform_compat PUBLIC
  zh_wwlib_file_ini
  zh_wwlib_stream_core
)

add_library(zh_wwlib_version STATIC
  "${WWLIB_DIR}/verchk.cpp"
)

target_include_directories(zh_wwlib_version PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
)

target_compile_definitions(zh_wwlib_version PRIVATE
  _UNIX
)

target_compile_options(zh_wwlib_version PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-c++11-narrowing
  -Wno-missing-field-initializers
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_libraries(zh_wwlib_version PUBLIC
  zh_wwlib_file_ini
)

add_library(zh_wwlib_containers STATIC
  "${WWLIB_DIR}/multilist.cpp"
  "${WWLIB_DIR}/slnode.cpp"
)

target_include_directories(zh_wwlib_containers PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
  "${WWDEBUG_DIR}"
)

target_compile_options(zh_wwlib_containers PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-unknown-pragmas
  -Wno-undefined-var-template
  -Wno-unused-but-set-variable
  -Wno-unused-parameter
)

target_link_libraries(zh_wwlib_file_ini PUBLIC
  zh_wwlib_containers
)

add_library(zh_wwlib_mutex STATIC
  "${WWLIB_DIR}/mutex.cpp"
)

target_include_directories(zh_wwlib_mutex PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
  "${WWDEBUG_DIR}"
)

target_compile_options(zh_wwlib_mutex PUBLIC
  "-iquote${WWLIB_DIR}"
)

target_compile_options(zh_wwlib_mutex PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

add_library(zh_wwlib_regex STATIC
  "${WWLIB_DIR}/regexpr.cpp"
)

target_include_directories(zh_wwlib_regex PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
)

target_compile_options(zh_wwlib_regex PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_libraries(zh_wwlib_regex PUBLIC
  zh_wwlib_string
)

add_library(zh_wwlib_systimer STATIC
  "${WWLIB_DIR}/_timer.cpp"
  "${WWLIB_DIR}/stimer.cpp"
  "${WWLIB_DIR}/systimer.cpp"
)

target_include_directories(zh_wwlib_systimer PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
)

target_compile_options(zh_wwlib_systimer PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

add_library(zh_wwlib_mpu STATIC
  "${WWLIB_DIR}/mpu.cpp"
)

target_include_directories(zh_wwlib_mpu PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
)

target_compile_options(zh_wwlib_mpu PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

add_library(zh_wwlib_thread STATIC
  "${WWLIB_DIR}/thread.cpp"
)

target_include_directories(zh_wwlib_thread PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
  "${WWDEBUG_DIR}"
)

target_compile_definitions(zh_wwlib_thread PRIVATE
  _UNIX
)

target_compile_options(zh_wwlib_thread PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

add_library(zh_wwlib_cpudetect STATIC
  "${WWLIB_DIR}/cpudetect.cpp"
)

target_include_directories(zh_wwlib_cpudetect PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
  "${WWDEBUG_DIR}"
)

target_compile_options(zh_wwlib_cpudetect PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_libraries(zh_wwlib_cpudetect PUBLIC
  zh_wwlib_string
  zh_wwlib_systimer
)

add_library(zh_wwlib_mono STATIC
  "${WWLIB_DIR}/mono.cpp"
  "${WWLIB_DIR}/_mono.cpp"
)

target_include_directories(zh_wwlib_mono PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
  "${WWDEBUG_DIR}"
)

target_compile_options(zh_wwlib_mono PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_libraries(zh_wwlib_mono PUBLIC
  zh_wwlib_platform_compat
)

add_library(zh_wwlib_msgloop STATIC
  "${WWLIB_DIR}/msgloop.cpp"
)

target_include_directories(zh_wwlib_msgloop PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
  "${WWDEBUG_DIR}"
)

target_compile_options(zh_wwlib_msgloop PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

add_library(zh_wwlib_keyboard STATIC
  "${WWLIB_DIR}/keyboard.cpp"
)

target_include_directories(zh_wwlib_keyboard PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
  "${WWDEBUG_DIR}"
)

target_compile_options(zh_wwlib_keyboard PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_libraries(zh_wwlib_keyboard PUBLIC
  zh_wwlib_msgloop
)

add_library(zh_wwlib_guarded_legacy STATIC
  "${WWLIB_DIR}/Except.cpp"
  "${WWLIB_DIR}/point.cpp"
)

target_include_directories(zh_wwlib_guarded_legacy PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
)

target_compile_options(zh_wwlib_guarded_legacy PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

add_library(zh_wwlib_refcount STATIC
  "${WWLIB_DIR}/refcount.cpp"
)

target_include_directories(zh_wwlib_refcount PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
)

target_compile_options(zh_wwlib_refcount PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-c++11-narrowing
  -Wno-extra-tokens
  -Wno-unknown-pragmas
  -Wno-unused-parameter
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

add_library(zh_wwdebug_profile STATIC
  "${WWLIB_DIR}/FastAllocator.cpp"
  "${WWDEBUG_DIR}/wwmemlog.cpp"
  "${WWDEBUG_DIR}/wwprofile.cpp"
)

target_include_directories(zh_wwdebug_profile PUBLIC
  "${WWDEBUG_DIR}"
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
)

target_compile_definitions(zh_wwdebug_profile PUBLIC
  _UNIX
  ${CNC_WWDEBUG_COMPILE_DEFINITIONS}
)

target_compile_options(zh_wwdebug_profile PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-c++11-narrowing
  -Wno-duplicate-decl-specifier
  -Wno-missing-declarations
  -Wno-return-type
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

target_link_libraries(zh_wwdebug_profile PUBLIC
  zh_wwdebug_core
  zh_wwlib_file_ini
  zh_wwlib_hash
  zh_wwlib_string
  zh_wwlib_systimer
)

add_library(zh_wwlib_targa STATIC
  "${WWLIB_DIR}/TARGA.CPP"
)

target_include_directories(zh_wwlib_targa PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
  "${WWDEBUG_DIR}"
)

target_compile_definitions(zh_wwlib_targa PRIVATE
  _UNIX
)

target_compile_options(zh_wwlib_targa PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-c++11-narrowing
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

target_link_libraries(zh_wwlib_targa PUBLIC
  zh_wwlib_file_ini
)

add_library(zh_wwlib_win_globals STATIC
  "${WWLIB_DIR}/win.cpp"
)

target_include_directories(zh_wwlib_win_globals PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
  "${WWDEBUG_DIR}"
)

target_compile_definitions(zh_wwlib_win_globals PUBLIC
  _WINDOWS
)

target_compile_options(zh_wwlib_win_globals PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_libraries(zh_wwlib_win_globals PUBLIC
  zh_wwdebug_core
)

add_library(zh_wwlib_surface_core STATIC
  "${WWLIB_DIR}/blit.cpp"
  "${WWLIB_DIR}/pcx.cpp"
  "${WWLIB_DIR}/surface.cpp"
  "${WWLIB_DIR}/xsurface.cpp"
)

target_include_directories(zh_wwlib_surface_core PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
  "${WWDEBUG_DIR}"
)

target_compile_options(zh_wwlib_surface_core PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-c++11-narrowing
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_libraries(zh_wwlib_surface_core PUBLIC
  zh_wwlib_file_ini
  zh_wwlib_utility_core
)

add_library(zh_wwlib_convert_globals STATIC
  "${WWLIB_DIR}/_convert.cpp"
)

target_include_directories(zh_wwlib_convert_globals PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
)

target_compile_options(zh_wwlib_convert_globals PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

add_library(zh_wwlib_font STATIC
  "${WWLIB_DIR}/wwfont.cpp"
)

target_include_directories(zh_wwlib_font PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
)

target_compile_options(zh_wwlib_font PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-reorder-ctor
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_libraries(zh_wwlib_font PUBLIC
  zh_wwlib_convert_globals
)

add_library(zh_wwlib_launchweb STATIC
  "${WWLIB_DIR}/LaunchWeb.cpp"
)

target_include_directories(zh_wwlib_launchweb PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
)

target_compile_definitions(zh_wwlib_launchweb PRIVATE
  NDEBUG
)

target_compile_options(zh_wwlib_launchweb PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-unknown-pragmas
  -Wno-unused-parameter
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
  "${WWMATH_DIR}/aabox.cpp"
  "${WWMATH_DIR}/aabtreecull.cpp"
  "${WWMATH_DIR}/colmath.cpp"
  "${WWMATH_DIR}/colmathaabox.cpp"
  "${WWMATH_DIR}/colmathaabtri.cpp"
  "${WWMATH_DIR}/colmathfrustum.cpp"
  "${WWMATH_DIR}/colmathline.cpp"
  "${WWMATH_DIR}/colmathobbobb.cpp"
  "${WWMATH_DIR}/colmathobbox.cpp"
  "${WWMATH_DIR}/colmathobbtri.cpp"
  "${WWMATH_DIR}/colmathplane.cpp"
  "${WWMATH_DIR}/colmathsphere.cpp"
  "${WWMATH_DIR}/cullsys.cpp"
  "${WWMATH_DIR}/euler.cpp"
  "${WWMATH_DIR}/frustum.cpp"
  "${WWMATH_DIR}/gridcull.cpp"
  "${WWMATH_DIR}/lineseg.cpp"
  "${WWMATH_DIR}/matrix3.cpp"
  "${WWMATH_DIR}/matrix3d.cpp"
  "${WWMATH_DIR}/matrix4.cpp"
  "${WWMATH_DIR}/obbox.cpp"
  "${WWMATH_DIR}/ode.cpp"
  "${WWMATH_DIR}/pot.cpp"
  "${WWMATH_DIR}/quat.cpp"
  "${WWMATH_DIR}/tri.cpp"
  "${WWMATH_DIR}/v3_rnd.cpp"
  "${WWMATH_DIR}/vp.cpp"
)

target_include_directories(zh_wwmath_core PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWMATH_DIR}"
  "${WWLIB_DIR}"
  "${WWDEBUG_DIR}"
)

target_link_libraries(zh_wwmath_core PUBLIC
  zh_wwlib_file_ini
  zh_wwlib_random
  zh_wwlib_refcount
)

target_compile_options(zh_wwmath_core PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  "-Wno-#pragma-messages"
  -Wno-deprecated-copy-with-user-provided-copy
  -Wno-logical-not-parentheses
  -Wno-logical-op-parentheses
  -Wno-microsoft-extra-qualification
  -Wno-overloaded-virtual
  -Wno-reorder-ctor
  -Wno-unknown-pragmas
  -Wno-unused-function
  -Wno-unused-parameter
  -Wno-unused-value
)

add_library(zh_wwsaveload_core STATIC
  "${WWSAVELOAD_DIR}/persistfactory.cpp"
  "${WWSAVELOAD_DIR}/pointerremap.cpp"
  "${WWSAVELOAD_DIR}/saveload.cpp"
  "${WWSAVELOAD_DIR}/saveloadstatus.cpp"
  "${WWSAVELOAD_DIR}/saveloadsubsystem.cpp"
)

target_include_directories(zh_wwsaveload_core PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
  "${WWDEBUG_DIR}"
  "${WWSAVELOAD_DIR}"
)

target_compile_options(zh_wwsaveload_core PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-c++11-narrowing
  -Wno-extra-tokens
  -Wno-logical-not-parentheses
  -Wno-unknown-pragmas
  -Wno-undefined-var-template
  -Wno-unused-but-set-variable
  -Wno-unused-parameter
  -Wno-unused-variable
  -Wno-writable-strings
)

target_link_libraries(zh_wwsaveload_core PUBLIC
  zh_wwlib_containers
  zh_wwlib_file_ini
  zh_wwlib_string
  zh_wwlib_systimer
)

add_library(zh_wwmath_curves STATIC
  "${WWMATH_DIR}/cardinalspline.cpp"
  "${WWMATH_DIR}/catmullromspline.cpp"
  "${WWMATH_DIR}/curve.cpp"
  "${WWMATH_DIR}/hermitespline.cpp"
  "${WWMATH_DIR}/tcbspline.cpp"
  "${WWMATH_DIR}/vehiclecurve.cpp"
)

target_include_directories(zh_wwmath_curves PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWMATH_DIR}"
  "${WWLIB_DIR}"
  "${WWDEBUG_DIR}"
  "${WWSAVELOAD_DIR}"
)

target_compile_options(zh_wwmath_curves PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  "-Wno-#pragma-messages"
  -Wno-c++11-narrowing
  -Wno-extra-tokens
  -Wno-logical-not-parentheses
  -Wno-overloaded-virtual
  -Wno-unknown-pragmas
  -Wno-undefined-var-template
  -Wno-unused-but-set-variable
  -Wno-unused-parameter
  -Wno-writable-strings
)

target_link_libraries(zh_wwmath_curves PUBLIC
  zh_wwsaveload_core
)

add_library(zh_wwmath_lookup STATIC
  "${WWMATH_DIR}/lookuptable.cpp"
  "${WWMATH_DIR}/wwmath.cpp"
)

target_include_directories(zh_wwmath_lookup PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWMATH_DIR}"
  "${WWLIB_DIR}"
  "${WWDEBUG_DIR}"
  "${WWSAVELOAD_DIR}"
)

target_compile_options(zh_wwmath_lookup PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  "-Wno-#pragma-messages"
  -Wno-c++11-narrowing
  -Wno-extra-tokens
  -Wno-keyword-macro
  -Wno-logical-not-parentheses
  -Wno-overloaded-virtual
  -Wno-unknown-pragmas
  -Wno-undefined-var-template
  -Wno-unused-but-set-variable
  -Wno-unused-parameter
  -Wno-unused-variable
  -Wno-writable-strings
)

target_link_libraries(zh_wwmath_lookup PUBLIC
  zh_wwlib_refcount
  zh_wwmath_curves
)

add_library(zh_wwsaveload_full STATIC
  "${WWSAVELOAD_DIR}/definition.cpp"
  "${WWSAVELOAD_DIR}/definitionfactory.cpp"
  "${WWSAVELOAD_DIR}/definitionfactorymgr.cpp"
  "${WWSAVELOAD_DIR}/definitionmgr.cpp"
  "${WWSAVELOAD_DIR}/parameter.cpp"
  "${WWSAVELOAD_DIR}/twiddler.cpp"
  "${WWSAVELOAD_DIR}/wwsaveload.cpp"
)

target_include_directories(zh_wwsaveload_full PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWLIB_DIR}"
  "${WWDEBUG_DIR}"
  "${WWSAVELOAD_DIR}"
  "${WWMATH_DIR}"
)

target_compile_options(zh_wwsaveload_full PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-c++11-narrowing
  -Wno-deprecated-copy-with-user-provided-copy
  -Wno-extra-tokens
  -Wno-keyword-macro
  -Wno-logical-not-parentheses
  -Wno-logical-op-parentheses
  -Wno-overloaded-virtual
  -Wno-reorder-ctor
  -Wno-switch
  -Wno-unknown-pragmas
  -Wno-undefined-var-template
  -Wno-unused-but-set-variable
  -Wno-unused-parameter
  -Wno-unused-variable
  -Wno-writable-strings
)

target_link_libraries(zh_wwsaveload_full PUBLIC
  zh_wwsaveload_core
  zh_wwlib_hash
  zh_wwlib_random
  zh_wwlib_refcount
  zh_wwlib_systimer
  zh_wwmath_core
)

add_library(zh_wwutil STATIC
  "${WWUTIL_DIR}/mathutil.cpp"
  "${WWUTIL_DIR}/miscutil.cpp"
)

target_include_directories(zh_wwutil PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWUTIL_DIR}"
  "${WWLIB_DIR}"
  "${WWDEBUG_DIR}"
  "${WWMATH_DIR}"
)

target_compile_definitions(zh_wwutil PRIVATE
  _UNIX
)

target_compile_options(zh_wwutil PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-c++11-narrowing
  -Wno-extra-tokens
  -Wno-keyword-macro
  -Wno-logical-not-parentheses
  -Wno-missing-field-initializers
  -Wno-unknown-pragmas
  -Wno-undefined-var-template
  -Wno-unused-but-set-variable
  -Wno-unused-parameter
  -Wno-writable-strings
)

target_link_libraries(zh_wwutil PUBLIC
  zh_wwlib_version
  zh_wwmath_lookup
)

add_library(zh_wwdownload STATIC
  "${WWDOWNLOAD_DIR}/Download.cpp"
  "${WWDOWNLOAD_DIR}/FTP.CPP"
  "${WWDOWNLOAD_DIR}/registry.cpp"
  "${WWDOWNLOAD_DIR}/urlBuilder.cpp"
)

target_include_directories(zh_wwdownload PUBLIC
  "${WASM_SHIMS_DIR}/WWDownload"
  "${WASM_SHIMS_DIR}"
  "${WWDOWNLOAD_DIR}"
  "${WWVEGAS_DIR}"
  "${WWLIB_DIR}"
)

target_compile_definitions(zh_wwdownload PRIVATE
  NDEBUG
)

target_compile_options(zh_wwdownload PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-parentheses
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

add_library(zh_gameengine_common_core STATIC
  src/wasm_ini_common_compat.cpp
  "${GAMEENGINE_COMMON_DIR}/System/GameMemory.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/MemoryInit.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/CriticalSection.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/File.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/LocalFileSystem.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/LocalFile.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/FileSystem.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/RAMFile.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/StreamingArchiveFile.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/ArchiveFile.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/ArchiveFileSystem.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/Snapshot.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/Geometry.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/Compression.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/DataChunk.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/Directory.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/AsciiString.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/UnicodeString.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/XferCRC.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/String.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/SubsystemInterface.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/CDManager.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/GameType.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/GameCommon.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/Trig.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/QuickTrig.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/List.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/QuotedPrintable.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/DisabledTypes.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/encrypt.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/KindOf.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/ObjectStatusTypes.cpp"
  "${GAMEENGINE_COMMON_DIR}/BitFlags.cpp"
  "${GAMEENGINE_COMMON_DIR}/MiniLog.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/StackDump.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/registry.cpp"
  "${GAMEENGINE_COMMON_DIR}/Dict.cpp"
  "${GAMEENGINE_COMMON_DIR}/DiscreteCircle.cpp"
  "${GAMEENGINE_COMMON_DIR}/Bezier/BezierSegment.cpp"
  "${GAMEENGINE_COMMON_DIR}/Bezier/BezFwdIterator.cpp"
  "${GAMEENGINE_COMMON_DIR}/Language.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIAudioEventInfo.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INICommandSet.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIControlBarScheme.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INICrate.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIDamageFX.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIDrawGroupInfo.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIMapData.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIModel.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIMiscAudio.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIMultiplayer.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INISpecialPower.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INITerrain.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INITerrainBridge.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INITerrainRoad.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIUpgrade.cpp"
  "${GAMEENGINE_COMMON_DIR}/Audio/AudioEventRTS.cpp"
  "${GAMEENGINE_COMMON_DIR}/MultiplayerSettings.cpp"
  "${GAMEENGINE_COMMON_DIR}/MessageStream.cpp"
  "${GAMEENGINE_COMMON_DIR}/PartitionSolver.cpp"
  "${GAMEENGINE_COMMON_DIR}/PerfTimer.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Energy.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Handicap.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/MissionStats.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Money.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/PlayerList.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/PlayerTemplate.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/ProductionPrerequisite.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Science.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/SpecialPower.cpp"
  "${GAMEENGINE_COMMON_DIR}/TerrainTypes.cpp"
  "${GAMEENGINE_COMMON_DIR}/NameKeyGenerator.cpp"
  "${GAMEENGINE_COMMON_DIR}/RandomValue.cpp"
  "${GAMEENGINE_COMMON_DIR}/crc.cpp"
  "${GAMEENGINE_COMMON_DIR}/version.cpp"
  "${GAMEENGINE_COMMON_DIR}/Audio/GameAudio.cpp"
  "${GAMEENGINE_COMMON_DIR}/Audio/GameMusic.cpp"
  "${GAMEENGINE_COMMON_DIR}/Audio/GameSounds.cpp"
  "${GAMEENGINE_COMMON_DIR}/Audio/AudioRequest.cpp"
  "${GAMEENGINE_COMMON_DIR}/Audio/DynamicAudioEventInfo.cpp"
  "${GAMEENGINE_COMMON_DIR}/Audio/urllaunch.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/Win32Device/Common/Win32LocalFile.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/Win32Device/Common/Win32LocalFileSystem.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/Win32Device/Common/Win32BIGFile.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/Win32Device/Common/Win32BIGFileSystem.cpp"
)

set_source_files_properties("${GAMEENGINE_COMMON_DIR}/Audio/urllaunch.cpp" PROPERTIES
  COMPILE_OPTIONS "-include${WASM_SHIMS_DIR}/windows.h"
)

set_source_files_properties("${GAMEENGINE_COMMON_DIR}/System/GameMemory.cpp" PROPERTIES
  COMPILE_OPTIONS "-fno-assume-sane-operator-new;-O0"
)

target_include_directories(zh_gameengine_common_core PUBLIC
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${WWSAVELOAD_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_definitions(zh_gameengine_common_core PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(zh_gameengine_common_core PRIVATE
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
)

target_link_libraries(zh_gameengine_common_core PUBLIC
  zh_compression_manager
)

add_library(zh_gameengine_real_compile_frontier STATIC
  "${GAMEENGINE_COMMON_DIR}/Audio/AudioEventRTS.cpp"
  "${GAMEENGINE_COMMON_DIR}/Audio/AudioRequest.cpp"
  "${GAMEENGINE_COMMON_DIR}/Audio/DynamicAudioEventInfo.cpp"
  "${GAMEENGINE_COMMON_DIR}/Audio/GameAudio.cpp"
  "${GAMEENGINE_COMMON_DIR}/Audio/GameMusic.cpp"
  "${GAMEENGINE_COMMON_DIR}/Audio/GameSounds.cpp"
  "${GAMEENGINE_COMMON_DIR}/Bezier/BezierSegment.cpp"
  "${GAMEENGINE_COMMON_DIR}/Bezier/BezFwdIterator.cpp"
  "${GAMEENGINE_COMMON_DIR}/BitFlags.cpp"
  "${GAMEENGINE_COMMON_DIR}/CommandLine.cpp"
  "${GAMEENGINE_COMMON_DIR}/CRCDebug.cpp"
  "${GAMEENGINE_COMMON_DIR}/DamageFX.cpp"
  "${GAMEENGINE_COMMON_DIR}/Dict.cpp"
  "${GAMEENGINE_COMMON_DIR}/DiscreteCircle.cpp"
  "${GAMEENGINE_COMMON_DIR}/GameEngine.cpp"
  "${GAMEENGINE_COMMON_DIR}/GameMain.cpp"
  "${GAMEENGINE_COMMON_DIR}/GlobalData.cpp"
  "${GAMEENGINE_COMMON_DIR}/GameLOD.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INI.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIAiData.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIAnimation.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIAudioEventInfo.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INICommandButton.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INICommandSet.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIControlBarScheme.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INICrate.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIDamageFX.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIDrawGroupInfo.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIGameData.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIMapCache.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIMapData.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIMappedImage.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIMiscAudio.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIModel.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIMultiplayer.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIObject.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIParticleSys.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INISpecialPower.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INITerrain.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INITerrainBridge.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INITerrainRoad.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIUpgrade.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIVideo.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIWater.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIWebpageURL.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIWeapon.cpp"
  "${GAMEENGINE_COMMON_DIR}/Language.cpp"
  "${GAMEENGINE_COMMON_DIR}/MessageStream.cpp"
  "${GAMEENGINE_COMMON_DIR}/MiniLog.cpp"
  "${GAMEENGINE_COMMON_DIR}/MultiplayerSettings.cpp"
  "${GAMEENGINE_COMMON_DIR}/NameKeyGenerator.cpp"
  "${GAMEENGINE_COMMON_DIR}/PartitionSolver.cpp"
  "${GAMEENGINE_COMMON_DIR}/PerfTimer.cpp"
  "${GAMEENGINE_COMMON_DIR}/RandomValue.cpp"
  "${GAMEENGINE_COMMON_DIR}/Recorder.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/AcademyStats.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/ActionManager.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Energy.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Handicap.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/MissionStats.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Money.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Player.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/PlayerList.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/PlayerTemplate.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/ProductionPrerequisite.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/ResourceGatheringManager.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Science.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/ScoreKeeper.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/SpecialPower.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Team.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/TunnelTracker.cpp"
  "${GAMEENGINE_COMMON_DIR}/SkirmishBattleHonors.cpp"
  "${GAMEENGINE_COMMON_DIR}/StateMachine.cpp"
  "${GAMEENGINE_COMMON_DIR}/StatsCollector.cpp"
  "${GAMEENGINE_COMMON_DIR}/UserPreferences.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/ArchiveFile.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/ArchiveFileSystem.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/AsciiString.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/BuildAssistant.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/CDManager.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/Compression.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/CriticalSection.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/DataChunk.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/Debug.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/Directory.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/DisabledTypes.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/File.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/FileSystem.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/FunctionLexicon.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/GameCommon.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/GameMemory.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/GameType.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/Geometry.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/KindOf.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/List.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/LocalFile.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/LocalFileSystem.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/MemoryInit.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/ObjectStatusTypes.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/QuickTrig.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/QuotedPrintable.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/RAMFile.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/SaveGame/GameState.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/SaveGame/GameStateMap.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/Snapshot.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/Radar.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/StackDump.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/StreamingArchiveFile.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/String.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/SubsystemInterface.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/Trig.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/UnicodeString.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/Upgrade.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/Xfer.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/XferCRC.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/XferLoad.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/XferSave.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/encrypt.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/registry.cpp"
  "${GAMEENGINE_COMMON_DIR}/TerrainTypes.cpp"
  "${GAMEENGINE_COMMON_DIR}/Thing/DrawModule.cpp"
  "${GAMEENGINE_COMMON_DIR}/Thing/Module.cpp"
  "${GAMEENGINE_COMMON_DIR}/Thing/ModuleFactory.cpp"
  "${GAMEENGINE_COMMON_DIR}/Thing/Thing.cpp"
  "${GAMEENGINE_COMMON_DIR}/Thing/ThingFactory.cpp"
  "${GAMEENGINE_COMMON_DIR}/Thing/ThingTemplate.cpp"
  "${GAMEENGINE_COMMON_DIR}/crc.cpp"
  "${GAMEENGINE_COMMON_DIR}/version.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/Common/System/W3DFunctionLexicon.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/Common/System/W3DRadar.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/Common/Thing/W3DModuleFactory.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/Common/W3DConvert.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/Common/Thing/W3DThingFactory.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DDebrisDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DDefaultDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DDependencyModelDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DLaserDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DModelDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DOverlordAircraftDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DOverlordTankDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DOverlordTruckDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DPoliceCarDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DProjectileStreamDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DPropDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DRopeDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DScienceModelDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DSupplyDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DTankDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DTankTruckDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DTracerDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DTreeDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DTruckDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Shadow/W3DBufferManager.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Shadow/W3DProjectedShadow.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Shadow/W3DShadow.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Shadow/W3DVolumetricShadow.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DAssetManager.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DAssetManagerExposed.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/BaseHeightMap.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/FlatHeightMap.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DBibBuffer.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DBridgeBuffer.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DCustomEdging.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DCheckBox.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DComboBox.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DHorizontalSlider.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DListBox.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DProgressBar.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DPushButton.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DRadioButton.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DStaticText.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DTabControl.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DTextEntry.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DVerticalSlider.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/GUICallbacks/W3DControlBar.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/GUICallbacks/W3DMainMenu.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/GUICallbacks/W3DMOTD.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/W3DGameFont.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/W3DGameWindow.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/W3DGameWindowManager.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/HeightMap.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/TerrainTex.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DDebugDisplay.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DDebugIcons.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DDynamicLight.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DDisplay.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DDisplayString.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DDisplayStringManager.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DFileSystem.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DGameClient.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DGranny.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DInGameUI.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DParticleSys.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DPoly.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DPropBuffer.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DRoadBuffer.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DMouse.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DScene.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DShaderManager.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DShroud.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DSmudge.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DSnow.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DStatusCircle.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DTerrainBackground.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DTerrainTracks.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DTerrainVisual.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DTreeBuffer.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DView.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DVideoBuffer.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DWebBrowser.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/TileData.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/WorldHeightMap.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/camerashakesystem.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3dWaypointBuffer.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Water/W3DWater.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Water/W3DWaterTracks.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameLogic/W3DGameLogic.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameLogic/W3DGhostObject.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameLogic/W3DTerrainLogic.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/Win32Device/Common/Win32CDManager.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/Win32Device/Common/Win32OSDisplay.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/Chat.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/LadderDefs.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/LobbyUtils.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/MainMenuUtils.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/PeerDefs.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/StagingRoomGameInfo.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/Thread/BuddyThread.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/Thread/GameResultsThread.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/Thread/PeerThread.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/Thread/PersistentStorageThread.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/Thread/PingThread.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/Thread/ThreadUtils.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpyChat.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpyGP.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpyOverlay.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/IPEnumeration.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/NAT.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/Network.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/Transport.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/udp.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AI.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AIDock.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AIGuardRetaliate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AITNGuard.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/Squad.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Map/PolygonTrigger.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Map/SidesList.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Map/TerrainLogic.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Armor.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Body/ActiveBody.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Body/BodyModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Body/HighlanderBody.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Body/HiveStructureBody.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Body/ImmortalBody.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Body/InactiveBody.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Body/StructureBody.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Body/UndeadBody.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/BattleBusSlowDeathBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/BehaviorModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/BridgeScaffoldBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/BridgeTowerBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/BunkerBusterBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/FireWeaponWhenDamagedBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/FireWeaponWhenDeadBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/GrantStealthBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/JetSlowDeathBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/NeutonBlastBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/OverchargeBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/POWTruckBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/ParkingPlaceBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/PoisonedBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/PrisonBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/PropagandaCenterBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/PropagandaTowerBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/RebuildHoleBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/SpawnBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/SupplyWarehouseCripplingBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CollideModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/ConvertToCarBombCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/ConvertToHijackedVehicleCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/CrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/HealCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/MoneyCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/SabotageCommandCenterCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/SabotageFakeBuilding.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/SabotageInternetCenterCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/SabotageMilitaryFactoryCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/SabotagePowerPlantCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/SalvageCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/SabotageSuperweaponCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/SabotageSupplyCenterCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/SabotageSupplyDropzoneCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/ShroudCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/UnitCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/VeterancyCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/FireWeaponCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/SquishCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/HealContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/HelixContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/MobNexusContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/OverlordContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/RailedTransportContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/RiderChangeContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/TransportContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/CaveContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/TunnelContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Create/CreateModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Create/GrantUpgradeCreate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Create/LockWeaponCreate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Create/PreorderCreate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Create/SpecialPowerCreate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Create/SupplyCenterCreate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Create/SupplyWarehouseCreate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Create/VeterancyGainCreate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Die/CreateObjectDie.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Die/CreateCrateDie.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Die/CrushDie.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Die/DamDie.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Die/DestroyDie.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Die/DieModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Die/EjectPilotDie.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Die/FXListDie.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Die/KeepObjectDie.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Die/RebuildHoleExposeDie.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Die/SpecialPowerCompletionDie.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Die/UpgradeDie.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Damage/BoneFXDamage.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Damage/DamageModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Damage/TransitionDamageFX.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Destroy/DestroyModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/ExperienceTracker.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/FiringTracker.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Helper/ObjectDefectionHelper.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Helper/ObjectHelper.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Helper/ObjectRepulsorHelper.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Helper/ObjectSMCHelper.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Helper/ObjectWeaponStatusHelper.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Helper/StatusDamageHelper.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Helper/SubdualDamageHelper.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Helper/TempWeaponBonusHelper.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/SpecialPower/BaikonurLaunchPower.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/SpecialPower/CashBountyPower.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/SpecialPower/CashHackSpecialPower.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/SpecialPower/CleanupAreaPower.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/SpecialPower/DefectorSpecialPower.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/SpecialPower/DemoralizeSpecialPower.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/SpecialPower/FireWeaponPower.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/SpecialPower/OCLSpecialPower.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/SpecialPower/SpecialAbility.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/SpecialPower/SpecialPowerModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/SpecialPower/SpyVisionSpecialPower.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/ActiveShroudUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/ArmorUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/CommandSetUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/CostModifierUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/ExperienceScalarUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/GrantScienceUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/LocomotorSetUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/MaxHealthUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/ModelConditionUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/ObjectCreationUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/PassengersFireUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/PowerPlantUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/RadarUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/ReplaceObjectUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/StatusBitsUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/StealthUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/SubObjectsUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/UnpauseSpecialPowerUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/UpgradeModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/WeaponBonusUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/WeaponSetUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/SimpleObjectIterator.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/AssaultTransportAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/DeployStyleAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/DozerAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/HackInternetAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/POWTruckAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/RailedTransportAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/SupplyTruckAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/TransportAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/WanderAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/WorkerAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AnimationSteeringUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AutoDepositUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AutoFindHealingUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/BaseRenerateUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/BoneFXUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/CheckpointUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/CleanupHazardUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/CommandButtonHuntUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/DockUpdate/PrisonDockUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/DockUpdate/RailedTransportDockUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/DockUpdate/RepairDockUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/DockUpdate/SupplyCenterDockUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/DynamicGeometryInfoUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/DynamicShroudClearingRangeUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/EMPUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/EnemyNearUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/FireWeaponUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/FirestormDynamicGeometryInfoUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/FireSpreadUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/FlammableUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/FloatUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/HeightDieUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/HijackerUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/MissileLauncherBuildingUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/MobMemberSlavedUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/NeutronMissileSlowDeathUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/OCLUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/PilotFindVehicleUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/PointDefenseLaserUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/PowerPlantUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/ProductionExitUpdate/DefaultProductionExitUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/ProductionExitUpdate/QueueProductionExitUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/ProductionExitUpdate/SupplyCenterProductionExitUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/ProductionUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/ProneUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/RadarUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/RadiusDecalUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/SmartBombTargetHomingUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/SpecialPowerUpdateModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/SpyVisionUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/StickyBombUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/SlavedUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/StealthDetectorUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/StealthUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/StructureCollapseUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/TensileFormationUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/ToppleUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/UpdateModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/ScriptEngine/VictoryConditions.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/System/CaveSystem.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/System/CrateSystem.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/System/Damage.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/System/GameLogicDispatch.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/System/RankInfo.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AIGroup.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AIGuard.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AIPlayer.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AISkirmishPlayer.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AIStates.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/TurretAI.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/AutoHealBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/BridgeBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/CountermeasuresBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/GenerateMinefieldBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/InstantDeathBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/MinefieldBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/TechBuildingBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/GarrisonContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/OpenContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/ParachuteContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Locomotor.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Object.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/ObjectCreationList.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/ChinookAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/DeliverPayloadAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/BattlePlanUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/DeletionUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/DemoTrapUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/DockUpdate/DockUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/DockUpdate/SupplyWarehouseDockUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/FireOCLAfterWeaponCooldownUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/HelicopterSlowDeathUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/HordeUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/LaserUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/LifetimeUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/ParticleUplinkCannonUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/PhysicsUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/ProductionExitUpdate/SpawnPointProductionExitUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/ProjectileStreamUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/SpectreGunshipDeploymentUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/SpectreGunshipUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/StructureToppleUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/WaveGuideUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Weapon.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/WeaponSet.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/ScriptEngine/ScriptActions.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/ScriptEngine/ScriptConditions.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/ScriptEngine/Scripts.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AIPathfind.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/DumbProjectileBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/FlightDeckBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/SlowDeathBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/InternetHackContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/GhostObject.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/ObjectTypes.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/PartitionManager.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/JetAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/MissileAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/RailroadGuideAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AssistedTargetingUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/NeutronMissileUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/SpecialAbilityUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/WeaponBonusUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/ScriptEngine/ScriptEngine.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/System/GameLogic.cpp"
)

set(ZH_GAMELOGIC_PRERTS_FRONTIER_SOURCES
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AIGuardRetaliate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AITNGuard.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/Squad.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/CaveContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/TunnelContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Damage/TransitionDamageFX.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/HackInternetAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/WanderAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AutoDepositUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/CheckpointUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/CleanupHazardUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/EMPUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/EnemyNearUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/FireSpreadUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/MobMemberSlavedUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/OCLUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/PointDefenseLaserUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/SlavedUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/StealthDetectorUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/StealthUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/TensileFormationUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AIGroup.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AIGuard.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AIPlayer.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AISkirmishPlayer.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AIStates.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/TurretAI.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/AutoHealBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/BridgeBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/CountermeasuresBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/GenerateMinefieldBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/InstantDeathBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/MinefieldBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/TechBuildingBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/GarrisonContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/OpenContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/ParachuteContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Locomotor.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Object.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/ObjectCreationList.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/ChinookAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/DeliverPayloadAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/BattlePlanUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/DeletionUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/DemoTrapUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/DockUpdate/DockUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/DockUpdate/SupplyWarehouseDockUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/FireOCLAfterWeaponCooldownUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/HelicopterSlowDeathUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/HordeUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/LaserUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/LifetimeUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/ParticleUplinkCannonUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/PhysicsUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/ProductionExitUpdate/SpawnPointProductionExitUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/ProjectileStreamUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/SpectreGunshipDeploymentUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/SpectreGunshipUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/StructureToppleUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/WaveGuideUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Weapon.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/WeaponSet.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/ScriptEngine/ScriptActions.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/ScriptEngine/ScriptConditions.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/ScriptEngine/Scripts.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AIPathfind.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/DumbProjectileBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/FlightDeckBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/SlowDeathBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/InternetHackContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/GhostObject.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/ObjectTypes.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/PartitionManager.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/JetAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/MissileAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/RailroadGuideAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AssistedTargetingUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/NeutronMissileUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/SpecialAbilityUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/WeaponBonusUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/ScriptEngine/ScriptEngine.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/System/GameLogic.cpp"
)

set_source_files_properties(${ZH_GAMELOGIC_PRERTS_FRONTIER_SOURCES} PROPERTIES
  COMPILE_OPTIONS "-U__PRERTS_H__;-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
)

set(ZH_LEGACY_GAMESPY_PRERTS_FRONTIER_SOURCES
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpyChat.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpyGP.cpp"
)

set_source_files_properties(${ZH_LEGACY_GAMESPY_PRERTS_FRONTIER_SOURCES} PROPERTIES
  COMPILE_OPTIONS "-U__PRERTS_H__;-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
)

# Browser-owned WOL declarations must not route real-header targets through
# the shadow GameNetwork/WOLBrowser/WebBrowser.h shim.
set(WOL_BROWSER_COMPILE_BRIDGE "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_webbrowser_boundary.h")

set_source_files_properties("${GAMEENGINE_COMMON_DIR}/GameEngine.cpp" PROPERTIES
  COMPILE_OPTIONS "-include${WASM_SHIMS_DIR}/atlbase.h;-include${WASM_SHIMS_DIR}/mmsystem.h;${WOL_BROWSER_COMPILE_BRIDGE}"
)

set_source_files_properties("${GAMEENGINE_COMMON_DIR}/INI/INIWebpageURL.cpp" PROPERTIES
  COMPILE_OPTIONS "${WOL_BROWSER_COMPILE_BRIDGE}"
)

set_source_files_properties("${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DWebBrowser.cpp" PROPERTIES
  COMPILE_OPTIONS "-include${WASM_SHIMS_DIR}/atlbase.h;${WOL_BROWSER_COMPILE_BRIDGE}"
)

set_source_files_properties("${GAMEENGINE_DEVICE_DIR}/Source/Win32Device/Common/Win32GameEngine.cpp" PROPERTIES
  COMPILE_OPTIONS "-include${WASM_SHIMS_DIR}/atlbase.h"
)

target_compile_definitions(zh_gameengine_real_compile_frontier PRIVATE
  __PRERTS_H__
)

target_compile_options(zh_gameengine_real_compile_frontier PRIVATE
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

target_include_directories(zh_gameengine_real_compile_frontier PRIVATE
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${WWSAVELOAD_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

add_library(zh_w3d_device_utility STATIC
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/TileData.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DFileSystem.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DPoly.cpp"
)

target_include_directories(zh_w3d_device_utility PUBLIC
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${WWSAVELOAD_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_definitions(zh_w3d_device_utility PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(zh_w3d_device_utility PRIVATE
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-logical-not-parentheses
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

target_link_libraries(zh_w3d_device_utility PUBLIC
  zh_gameengine_common_core
  zh_wwlib_file_ini
  zh_wwdebug_core
  zh_wwlib_refcount
  zh_wwmath_core
)

add_library(zh_w3d_display_drawimage_runtime STATIC
  "${GAMEENGINE_GAMECLIENT_DIR}/DisplayString.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GlobalLanguage.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Line2D.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GameFont.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/MessageStream/HotKey.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/Common/System/W3DFunctionLexicon.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DDisplay.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DDisplayString.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DVideoBuffer.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DCheckBox.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DComboBox.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DHorizontalSlider.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DListBox.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DProgressBar.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DPushButton.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DRadioButton.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DStaticText.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DTabControl.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DTextEntry.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DVerticalSlider.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/W3DGameFont.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/W3DGameWindow.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/W3DGameWindowManager.cpp"
)

target_compile_definitions(zh_w3d_display_drawimage_runtime PRIVATE
  __PRERTS_H__
  Reset_D3D_Device=W3DDisplay_DrawImageProbe_Reset_D3D_Device
)

target_include_directories(zh_w3d_display_drawimage_runtime PRIVATE
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${WWSAVELOAD_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_options(zh_w3d_display_drawimage_runtime PRIVATE
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-include${GAMEENGINE_INCLUDE_DIR}/Common/GlobalData.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

add_library(zh_w3d_terrain_probe_runtime STATIC
  "${GAMEENGINE_COMMON_DIR}/DamageFX.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIDamageFX.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIObject.cpp"
  "${GAMEENGINE_COMMON_DIR}/Thing/DrawModule.cpp"
  "${GAMEENGINE_COMMON_DIR}/Thing/Module.cpp"
  "${GAMEENGINE_COMMON_DIR}/Thing/ModuleFactory.cpp"
  "${GAMEENGINE_COMMON_DIR}/Thing/Thing.cpp"
  "${GAMEENGINE_COMMON_DIR}/Thing/ThingFactory.cpp"
  "${GAMEENGINE_COMMON_DIR}/Thing/ThingTemplate.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/AcademyStats.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Energy.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Money.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Player.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/PlayerList.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/ScoreKeeper.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Team.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/TunnelTracker.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AI.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Map/TerrainLogic.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Map/PolygonTrigger.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/ScriptEngine/Scripts.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/ScriptEngine/ScriptEngine.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/Squad.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Armor.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/FiringTracker.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/WeaponSet.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/BehaviorModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/BridgeBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/BridgeScaffoldBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/BridgeTowerBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Body/ActiveBody.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Body/BodyModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Body/ImmortalBody.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Helper/ObjectDefectionHelper.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Helper/ObjectHelper.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Helper/ObjectRepulsorHelper.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Helper/ObjectSMCHelper.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Helper/ObjectWeaponStatusHelper.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Helper/StatusDamageHelper.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Helper/SubdualDamageHelper.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Helper/TempWeaponBonusHelper.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/PartitionManager.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/UpdateModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/ObjectTypes.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/System/Damage.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/System/RankInfo.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/System/Smudge.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Terrain/TerrainVisual.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DAssetManager.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/BaseHeightMap.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/FlatHeightMap.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/HeightMap.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/TerrainTex.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/TileData.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DBibBuffer.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DBridgeBuffer.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DPropBuffer.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DRoadBuffer.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DShaderManager.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DShroud.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DSmudge.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DTerrainBackground.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DTerrainVisual.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DTreeBuffer.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/WorldHeightMap.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3dWaypointBuffer.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Water/W3DWater.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Water/W3DWaterTracks.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameLogic/W3DTerrainLogic.cpp"
)

target_link_libraries(zh_w3d_terrain_probe_runtime PUBLIC
  zh_w3d_device_utility
)

target_compile_definitions(zh_w3d_terrain_probe_runtime PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  CNC_PORT_TERRAIN_PROBE_MINIMAL_HEIGHTMAP_SYSTEMS=1
  CNC_PORT_TERRAIN_PROBE_USE_ORIGINAL_ACTION_MANAGER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_include_directories(zh_w3d_terrain_probe_runtime PRIVATE
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${WWSAVELOAD_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_options(zh_w3d_terrain_probe_runtime PRIVATE
  -ffunction-sections
  -fdata-sections
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  "-DMIN(a,b)=(((a)<(b))?(a):(b))"
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-invalid-offsetof
  -Wno-new-returns-null
  -Wno-non-pod-varargs
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

add_library(zh_w3d_scene_probe_runtime STATIC
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DScene.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DStatusCircle.cpp"
)

target_compile_definitions(zh_w3d_scene_probe_runtime PRIVATE
  __PRERTS_H__
)

target_include_directories(zh_w3d_scene_probe_runtime PRIVATE
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${WWSAVELOAD_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_options(zh_w3d_scene_probe_runtime PRIVATE
  -ffunction-sections
  -fdata-sections
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

# Original platform-independent audio engine sources compiled against the
# real engine headers (real Common/INI.h, real GlobalData.h), so the real
# AudioManager::init() INI parse path runs in the linked cnc-port runtime.
# zh_gameengine_common_core carries shim-world copies of these files for the
# legacy probe targets; targets that link this library first get the
# real-world objects and the shim copies are never extracted.
#
# SubsystemInterface.cpp must come from this real-world library in any target
# that also links the real INI runtime: the legacy shims/Common/INI.h class
# emits weak inline definitions whose mangled names collide with the real
# INI.cpp methods, so a shim-world `INI ini;` local (12 bytes) ends up running
# the real INI constructor (9272 bytes) and smashes the memory above the
# stack. SubsystemInterfaceList::initSubsystem() constructs such a local.
add_library(zh_gameengine_audio_runtime STATIC
  "${GAMEENGINE_COMMON_DIR}/System/SubsystemInterface.cpp"
  "${GAMEENGINE_COMMON_DIR}/Audio/GameAudio.cpp"
  "${GAMEENGINE_COMMON_DIR}/Audio/GameMusic.cpp"
  "${GAMEENGINE_COMMON_DIR}/Audio/GameSounds.cpp"
  "${GAMEENGINE_COMMON_DIR}/Audio/AudioEventRTS.cpp"
  "${GAMEENGINE_COMMON_DIR}/Audio/AudioRequest.cpp"
  "${GAMEENGINE_COMMON_DIR}/Audio/DynamicAudioEventInfo.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIAudioEventInfo.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIMiscAudio.cpp"
)

target_include_directories(zh_gameengine_audio_runtime PUBLIC
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_definitions(zh_gameengine_audio_runtime PRIVATE
  __PRERTS_H__
  ${CNC_ENGINE_DEBUG_COMPILE_DEFINITIONS}
  NO_DEBUG_CRC=1
)

target_compile_options(zh_gameengine_audio_runtime PRIVATE
  ${CNC_EXCEPTION_COMPILE_OPTION}
  -ffunction-sections
  -fdata-sections
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-invalid-offsetof
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

add_library(zh_miles_audio_device_compile_frontier STATIC
  "${GAMEENGINE_DEVICE_DIR}/Source/MilesAudioDevice/MilesAudioManager.cpp"
)

target_include_directories(zh_miles_audio_device_compile_frontier PUBLIC
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/Miles6/include"
  "${WWAUDIO_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${WWSAVELOAD_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_definitions(zh_miles_audio_device_compile_frontier PRIVATE
  __PRERTS_H__
)

target_compile_options(zh_miles_audio_device_compile_frontier PRIVATE
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/Miles6/include"
  "-iquote${WWAUDIO_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-logical-not-parentheses
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

add_library(zh_bink_video_device_compile_frontier STATIC
  "${GAMEENGINE_DEVICE_DIR}/Source/VideoDevice/Bink/BinkVideoPlayer.cpp"
)

target_include_directories(zh_bink_video_device_compile_frontier PUBLIC
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${WWSAVELOAD_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_definitions(zh_bink_video_device_compile_frontier PRIVATE
  __PRERTS_H__
)

target_compile_options(zh_bink_video_device_compile_frontier PRIVATE
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-logical-not-parentheses
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

add_library(zh_browser_bink STATIC
  src/wasm_bink_provider.cpp
)

target_include_directories(zh_browser_bink PUBLIC
  "${WASM_SHIMS_DIR}"
)

target_compile_options(zh_browser_bink PRIVATE
  -Wall
  -Wextra
  -Wpedantic
  -Wno-unused-parameter
)

target_link_libraries(zh_bink_video_device_compile_frontier PUBLIC
  zh_browser_bink
)

add_library(zh_wwaudio_compile_frontier STATIC
  "${WWAUDIO_DIR}/AudibleSound.cpp"
  "${WWAUDIO_DIR}/AudioSaveLoad.cpp"
  "${WWAUDIO_DIR}/FilteredSound.cpp"
  "${WWAUDIO_DIR}/Listener.cpp"
  "${WWAUDIO_DIR}/LogicalListener.cpp"
  "${WWAUDIO_DIR}/LogicalSound.cpp"
  "${WWAUDIO_DIR}/Sound3D.cpp"
  "${WWAUDIO_DIR}/SoundBuffer.cpp"
  "${WWAUDIO_DIR}/SoundPseudo3D.cpp"
  "${WWAUDIO_DIR}/SoundScene.cpp"
  "${WWAUDIO_DIR}/SoundSceneObj.cpp"
  "${WWAUDIO_DIR}/Threads.cpp"
  "${WWAUDIO_DIR}/Utils.cpp"
  "${WWAUDIO_DIR}/WWAudio.cpp"
  "${WWAUDIO_DIR}/listenerhandle.cpp"
  "${WWAUDIO_DIR}/sound2dhandle.cpp"
  "${WWAUDIO_DIR}/sound3dhandle.cpp"
  "${WWAUDIO_DIR}/soundhandle.cpp"
  "${WWAUDIO_DIR}/soundstreamhandle.cpp"
)

target_include_directories(zh_wwaudio_compile_frontier PUBLIC
  "${WASM_SHIMS_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWAUDIO_DIR}"
  "${WWVEGAS_DIR}/Miles6/include"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${WWSAVELOAD_DIR}"
)

target_compile_options(zh_wwaudio_compile_frontier PRIVATE
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWAUDIO_DIR}"
  "-iquote${WWVEGAS_DIR}/Miles6/include"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-logical-not-parentheses
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

add_library(zh_ww3d2_compile_frontier STATIC
  "${WWVEGAS_DIR}/WW3D2/aabtree.cpp"
  "${WWVEGAS_DIR}/WW3D2/aabtreebuilder.cpp"
  "${WWVEGAS_DIR}/WW3D2/agg_def.cpp"
  "${WWVEGAS_DIR}/WW3D2/animatedsoundmgr.cpp"
  "${WWVEGAS_DIR}/WW3D2/animobj.cpp"
  "${WWVEGAS_DIR}/WW3D2/assetstatus.cpp"
  "${WWVEGAS_DIR}/WW3D2/assetmgr.cpp"
  "${WWVEGAS_DIR}/WW3D2/bitmaphandler.cpp"
  "${WWVEGAS_DIR}/WW3D2/bmp2d.cpp"
  "${WWVEGAS_DIR}/WW3D2/boxrobj.cpp"
  "${WWVEGAS_DIR}/WW3D2/bw_render.cpp"
  "${WWVEGAS_DIR}/WW3D2/bwrender.cpp"
  "${WWVEGAS_DIR}/WW3D2/camera.cpp"
  "${WWVEGAS_DIR}/WW3D2/collect.cpp"
  "${WWVEGAS_DIR}/WW3D2/coltest.cpp"
  "${WWVEGAS_DIR}/WW3D2/composite.cpp"
  "${WWVEGAS_DIR}/WW3D2/dazzle.cpp"
  "${WWVEGAS_DIR}/WW3D2/ddsfile.cpp"
  "${WWVEGAS_DIR}/WW3D2/decalsys.cpp"
  "${WWVEGAS_DIR}/WW3D2/decalmsh.cpp"
  "${WWVEGAS_DIR}/WW3D2/distlod.cpp"
  "${WWVEGAS_DIR}/WW3D2/dx8caps.cpp"
  "${WWVEGAS_DIR}/WW3D2/dx8fvf.cpp"
  "${WWVEGAS_DIR}/WW3D2/dx8indexbuffer.cpp"
  "${WWVEGAS_DIR}/WW3D2/dx8polygonrenderer.cpp"
  "${WWVEGAS_DIR}/WW3D2/dx8renderer.cpp"
  "${WWVEGAS_DIR}/WW3D2/dx8rendererdebugger.cpp"
  "${WWVEGAS_DIR}/WW3D2/dx8texman.cpp"
  "${WWVEGAS_DIR}/WW3D2/dx8vertexbuffer.cpp"
  "${WWVEGAS_DIR}/WW3D2/dx8webbrowser.cpp"
  "${WWVEGAS_DIR}/WW3D2/dx8wrapper.cpp"
  "${WWVEGAS_DIR}/WW3D2/dynamesh.cpp"
  "${WWVEGAS_DIR}/WW3D2/font3d.cpp"
  "${WWVEGAS_DIR}/WW3D2/formconv.cpp"
  "${WWVEGAS_DIR}/WW3D2/FramGrab.cpp"
  "${WWVEGAS_DIR}/WW3D2/hanim.cpp"
  "${WWVEGAS_DIR}/WW3D2/hanimmgr.cpp"
  "${WWVEGAS_DIR}/WW3D2/hcanim.cpp"
  "${WWVEGAS_DIR}/WW3D2/hlod.cpp"
  "${WWVEGAS_DIR}/WW3D2/hmorphanim.cpp"
  "${WWVEGAS_DIR}/WW3D2/hmdldef.cpp"
  "${WWVEGAS_DIR}/WW3D2/hrawanim.cpp"
  "${WWVEGAS_DIR}/WW3D2/htree.cpp"
  "${WWVEGAS_DIR}/WW3D2/htreemgr.cpp"
  "${WWVEGAS_DIR}/WW3D2/intersec.cpp"
  "${WWVEGAS_DIR}/WW3D2/layer.cpp"
  "${WWVEGAS_DIR}/WW3D2/light.cpp"
  "${WWVEGAS_DIR}/WW3D2/lightenvironment.cpp"
  "${WWVEGAS_DIR}/WW3D2/line3d.cpp"
  "${WWVEGAS_DIR}/WW3D2/linegrp.cpp"
  "${WWVEGAS_DIR}/WW3D2/mapper.cpp"
  "${WWVEGAS_DIR}/WW3D2/matinfo.cpp"
  "${WWVEGAS_DIR}/WW3D2/matpass.cpp"
  "${WWVEGAS_DIR}/WW3D2/matrixmapper.cpp"
  "${WWVEGAS_DIR}/WW3D2/mesh.cpp"
  "${WWVEGAS_DIR}/WW3D2/meshbuild.cpp"
  "${WWVEGAS_DIR}/WW3D2/meshgeometry.cpp"
  "${WWVEGAS_DIR}/WW3D2/meshmatdesc.cpp"
  "${WWVEGAS_DIR}/WW3D2/meshmdl.cpp"
  "${WWVEGAS_DIR}/WW3D2/meshmdlio.cpp"
  "${WWVEGAS_DIR}/WW3D2/meshdam.cpp"
  "${WWVEGAS_DIR}/WW3D2/metalmap.cpp"
  "${WWVEGAS_DIR}/WW3D2/missingtexture.cpp"
  "${WWVEGAS_DIR}/WW3D2/motchan.cpp"
  "${WWVEGAS_DIR}/WW3D2/nullrobj.cpp"
  "${WWVEGAS_DIR}/WW3D2/part_buf.cpp"
  "${WWVEGAS_DIR}/WW3D2/part_emt.cpp"
  "${WWVEGAS_DIR}/WW3D2/part_ldr.cpp"
  "${WWVEGAS_DIR}/WW3D2/pivot.cpp"
  "${WWVEGAS_DIR}/WW3D2/pointgr.cpp"
  "${WWVEGAS_DIR}/WW3D2/polyinfo.cpp"
  "${WWVEGAS_DIR}/WW3D2/pot.cpp"
  "${WWVEGAS_DIR}/WW3D2/predlod.cpp"
  "${WWVEGAS_DIR}/WW3D2/prim_anim.cpp"
  "${WWVEGAS_DIR}/WW3D2/projector.cpp"
  "${WWVEGAS_DIR}/WW3D2/proto.cpp"
  "${WWVEGAS_DIR}/WW3D2/render2d.cpp"
  "${WWVEGAS_DIR}/WW3D2/render2dsentence.cpp"
  "${WWVEGAS_DIR}/WW3D2/renderobjectrecycler.cpp"
  "${WWVEGAS_DIR}/WW3D2/rendobj.cpp"
  "${WWVEGAS_DIR}/WW3D2/rinfo.cpp"
  "${WWVEGAS_DIR}/WW3D2/ringobj.cpp"
  "${WWVEGAS_DIR}/WW3D2/scene.cpp"
  "${WWVEGAS_DIR}/WW3D2/segline.cpp"
  "${WWVEGAS_DIR}/WW3D2/seglinerenderer.cpp"
  "${WWVEGAS_DIR}/WW3D2/shader.cpp"
  "${WWVEGAS_DIR}/WW3D2/shattersystem.cpp"
  "${WWVEGAS_DIR}/WW3D2/snappts.cpp"
  "${WWVEGAS_DIR}/WW3D2/sortingrenderer.cpp"
  "${WWVEGAS_DIR}/WW3D2/soundrobj.cpp"
  "${WWVEGAS_DIR}/WW3D2/sphereobj.cpp"
  "${WWVEGAS_DIR}/WW3D2/sr_util.cpp"
  "${WWVEGAS_DIR}/WW3D2/static_sort_list.cpp"
  "${WWVEGAS_DIR}/WW3D2/statistics.cpp"
  "${WWVEGAS_DIR}/WW3D2/streak.cpp"
  "${WWVEGAS_DIR}/WW3D2/streakRender.cpp"
  "${WWVEGAS_DIR}/WW3D2/stripoptimizer.cpp"
  "${WWVEGAS_DIR}/WW3D2/surfaceclass.cpp"
  "${WWVEGAS_DIR}/WW3D2/texfcach.cpp"
  "${WWVEGAS_DIR}/WW3D2/texproject.cpp"
  "${WWVEGAS_DIR}/WW3D2/textdraw.cpp"
  "${WWVEGAS_DIR}/WW3D2/texture.cpp"
  "${WWVEGAS_DIR}/WW3D2/texturefilter.cpp"
  "${WWVEGAS_DIR}/WW3D2/texturefile.cpp"
  "${WWVEGAS_DIR}/WW3D2/textureloader.cpp"
  "${WWVEGAS_DIR}/WW3D2/texturethumbnail.cpp"
  "${WWVEGAS_DIR}/WW3D2/txt.cpp"
  "${WWVEGAS_DIR}/WW3D2/txt2d.cpp"
  "${WWVEGAS_DIR}/WW3D2/vertmaterial.cpp"
  "${WWVEGAS_DIR}/WW3D2/visrasterizer.cpp"
  "${WWVEGAS_DIR}/WW3D2/w3d_dep.cpp"
  "${WWVEGAS_DIR}/WW3D2/w3d_util.cpp"
  "${WWVEGAS_DIR}/WW3D2/w3dexclusionlist.cpp"
  "${WWVEGAS_DIR}/WW3D2/ww3d.cpp"
  "${WWVEGAS_DIR}/WW3D2/ww3dformat.cpp"
)

target_include_directories(zh_ww3d2_compile_frontier PUBLIC
  "${WASM_SHIMS_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWVEGAS_DIR}/WWAudio"
  "${WWDEBUG_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${WWSAVELOAD_DIR}"
)

target_compile_options(zh_ww3d2_compile_frontier PRIVATE
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWVEGAS_DIR}/WWAudio"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-logical-not-parentheses
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

set_source_files_properties("${WWVEGAS_DIR}/WW3D2/dx8wrapper.cpp" PROPERTIES
  COMPILE_DEFINITIONS WASM_D3D8_LOADER_SHIM=1
)

set(WWSHADE_SHADER_SOURCES
  "${WWSHADE_DIR}/shd6bumpdiff.vsh"
  "${WWSHADE_DIR}/shd6bumpspec.vsh"
  "${WWSHADE_DIR}/shd7bumpdiffpass0.vsh"
  "${WWSHADE_DIR}/shd7bumpdiffpass1.vsh"
  "${WWSHADE_DIR}/shd7bumpspecpass0.vsh"
  "${WWSHADE_DIR}/shd7bumpspecpass1.vsh"
  "${WWSHADE_DIR}/shd8bumpdiff.psh"
  "${WWSHADE_DIR}/shd8bumpdiff.vsh"
  "${WWSHADE_DIR}/shd8bumpspec.psh"
  "${WWSHADE_DIR}/shd8bumpspec.vsh"
  "${WWSHADE_DIR}/shd8ssbumpdiff.psh"
  "${WWSHADE_DIR}/shd8ssbumpdiff.vsh"
  "${WWSHADE_DIR}/shd8ssbumpspec.psh"
  "${WWSHADE_DIR}/shd8ssbumpspec.vsh"
)

set(WWSHADE_GENERATED_DIR "${CMAKE_CURRENT_BINARY_DIR}/generated/wwshade")
set(WWSHADE_SHADER_CODE_HEADERS)

foreach(shader_source IN LISTS WWSHADE_SHADER_SOURCES)
  get_filename_component(shader_name "${shader_source}" NAME)
  set(shader_header "${WWSHADE_GENERATED_DIR}/${shader_name}_code.h")
  list(APPEND WWSHADE_SHADER_CODE_HEADERS "${shader_header}")
  add_custom_command(
    OUTPUT "${shader_header}"
    COMMAND "${NODE_EXECUTABLE}"
      "${CMAKE_CURRENT_SOURCE_DIR}/tools/generate_wwshade_shader_header.mjs"
      "${shader_source}"
      "${shader_header}"
    DEPENDS
      "${shader_source}"
      "${CMAKE_CURRENT_SOURCE_DIR}/tools/generate_wwshade_shader_header.mjs"
    VERBATIM
  )
endforeach()

add_custom_target(zh_wwshade_shader_headers
  DEPENDS ${WWSHADE_SHADER_CODE_HEADERS}
)

set(WW3D_REQUIRED_ASSETS_DIR "${WWVEGAS_DIR}/WW3D2/RequiredAssets")
set(WW3D_SOURCE_ASSET "${WW3D_REQUIRED_ASSETS_DIR}/ShatterPlanes0.w3d")
set(WW3D_SOURCE_ASSET_GENERATED_DIR "${CMAKE_CURRENT_BINARY_DIR}/generated/ww3d_assets")
set(WW3D_SOURCE_ASSET_HEADER "${WW3D_SOURCE_ASSET_GENERATED_DIR}/shatterplanes0_w3d.h")

add_custom_command(
  OUTPUT "${WW3D_SOURCE_ASSET_HEADER}"
  COMMAND "${NODE_EXECUTABLE}"
    "${CMAKE_CURRENT_SOURCE_DIR}/tools/generate_binary_header.mjs"
    "${WW3D_SOURCE_ASSET}"
    "${WW3D_SOURCE_ASSET_HEADER}"
    "kShatterPlanes0W3d"
  DEPENDS
    "${WW3D_SOURCE_ASSET}"
    "${CMAKE_CURRENT_SOURCE_DIR}/tools/generate_binary_header.mjs"
  VERBATIM
)

add_custom_target(cnc_port_ww3d_asset_headers
  DEPENDS "${WW3D_SOURCE_ASSET_HEADER}"
)

add_library(zh_wwshade_compile_frontier STATIC
  "${WWSHADE_DIR}/shd6bumpdiff.cpp"
  "${WWSHADE_DIR}/shd6bumpspec.cpp"
  "${WWSHADE_DIR}/shd7bumpdiff.cpp"
  "${WWSHADE_DIR}/shd7bumpspec.cpp"
  "${WWSHADE_DIR}/shd8bumpdiff.cpp"
  "${WWSHADE_DIR}/shd8bumpspec.cpp"
  "${WWSHADE_DIR}/shdbumpdiff.cpp"
  "${WWSHADE_DIR}/shdbumpspec.cpp"
  "${WWSHADE_DIR}/shdcubemap.cpp"
  "${WWSHADE_DIR}/shddef.cpp"
  "${WWSHADE_DIR}/shddeffactory.cpp"
  "${WWSHADE_DIR}/shddefmanager.cpp"
  "${WWSHADE_DIR}/shdforcelinks.cpp"
  "${WWSHADE_DIR}/shdglossmask.cpp"
  "${WWSHADE_DIR}/shdhwshader.cpp"
  "${WWSHADE_DIR}/shdinterface.cpp"
  "${WWSHADE_DIR}/shdlegacyw3d.cpp"
  "${WWSHADE_DIR}/shdlib.cpp"
  "${WWSHADE_DIR}/shdloader.cpp"
  "${WWSHADE_DIR}/shdmesh.cpp"
  "${WWSHADE_DIR}/shdrenderer.cpp"
  "${WWSHADE_DIR}/shdsimple.cpp"
  "${WWSHADE_DIR}/shdsubmesh.cpp"
)

add_dependencies(zh_wwshade_compile_frontier
  zh_wwshade_shader_headers
)

target_include_directories(zh_wwshade_compile_frontier PUBLIC
  "${WASM_SHIMS_DIR}"
  "${WWSHADE_GENERATED_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWVEGAS_DIR}/WWAudio"
  "${WWSHADE_DIR}"
  "${WWDEBUG_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${WWSAVELOAD_DIR}"
)

target_compile_options(zh_wwshade_compile_frontier PRIVATE
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-iquote${WWSHADE_GENERATED_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWVEGAS_DIR}/WWAudio"
  "-iquote${WWSHADE_DIR}"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-logical-not-parentheses
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

add_library(zh_gameclient_text STATIC
  "${GAMEENGINE_GAMECLIENT_DIR}/GameText.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/LanguageFilter.cpp"
)

target_include_directories(zh_gameclient_text PUBLIC
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWMATH_DIR}"
  "${WWLIB_DIR}"
  "${WWSAVELOAD_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_definitions(zh_gameclient_text PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(zh_gameclient_text PRIVATE
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
)

target_link_libraries(zh_gameclient_text PUBLIC
  zh_gameengine_common_core
)

add_library(zh_gameengine_debug_runtime STATIC
  src/wasm_debug_runtime.cpp
  "${GAMEENGINE_COMMON_DIR}/System/Debug.cpp"
)

target_compile_definitions(zh_gameengine_debug_runtime PRIVATE
  ${CNC_ENGINE_DEBUG_COMPILE_DEFINITIONS}
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_include_directories(zh_gameengine_debug_runtime PUBLIC
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWMATH_DIR}"
  "${WWLIB_DIR}"
  "${WWSAVELOAD_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_options(zh_gameengine_debug_runtime PRIVATE
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
)

target_link_libraries(zh_gameengine_debug_runtime PUBLIC
  zh_gameengine_common_core
)

add_library(zh_gameengine_globaldata_runtime STATIC
  src/wasm_globaldata_probe.cpp
  "${GAMEENGINE_COMMON_DIR}/CommandLine.cpp"
  "${GAMEENGINE_COMMON_DIR}/GlobalData.cpp"
)

target_compile_definitions(zh_gameengine_globaldata_runtime PRIVATE
  __PRERTS_H__
  ${CNC_ENGINE_DEBUG_COMPILE_DEFINITIONS}
)

target_include_directories(zh_gameengine_globaldata_runtime PUBLIC
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_options(zh_gameengine_globaldata_runtime PRIVATE
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-invalid-offsetof
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

add_library(zh_gameengine_real_ini_runtime STATIC
  src/wasm_ini_layout_probe.cpp
  src/wasm_real_ini_compat.cpp
  src/wasm_real_ini_probe.cpp
  src/wasm_command_button_runtime.cpp
  "${GAMEENGINE_COMMON_DIR}/INI/INI.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIAiData.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INICommandButton.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INICommandSet.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIControlBarScheme.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INICrate.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIDamageFX.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIDrawGroupInfo.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIGameData.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIMappedImage.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIMapCache.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIMultiplayer.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIParticleSys.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INISpecialPower.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INITerrain.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INITerrainBridge.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INITerrainRoad.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIUpgrade.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIVideo.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIWater.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIWeapon.cpp"
  "${GAMEENGINE_COMMON_DIR}/MultiplayerSettings.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/AcademyStats.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Money.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/PlayerTemplate.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/SpecialPower.cpp"
  "${GAMEENGINE_COMMON_DIR}/DamageFX.cpp"
  "${GAMEENGINE_COMMON_DIR}/GameLOD.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/ObjectStatusTypes.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/Upgrade.cpp"
  "${GAMEENGINE_COMMON_DIR}/TerrainTypes.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ChallengeGenerals.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/DrawGroupInfo.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/FXList.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBarScheme.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/RadiusDecal.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/System/ParticleSys.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/System/Image.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Snow.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Terrain/TerrainRoads.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/VideoPlayer.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Water.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/Chat.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AI.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Map/SidesList.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Armor.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/ObjectCreationList.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/DeliverPayloadAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/System/Damage.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/System/CrateSystem.cpp"
)

set_source_files_properties("${GAMEENGINE_GAMECLIENT_DIR}/System/ParticleSys.cpp" PROPERTIES
  COMPILE_OPTIONS "-include;${WWVEGAS_PORT_SHIM};-include;${GAMEENGINE_INCLUDE_DIR}/Common/GlobalData.h"
)

target_compile_definitions(zh_gameengine_real_ini_runtime PRIVATE
  ${CNC_ENGINE_DEBUG_COMPILE_DEFINITIONS}
  CNC_PORT_LINKS_REAL_INI_COMPAT_OWNERS=1
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  NO_DEBUG_CRC=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
  WASM_REAL_INI_LOCOMOTOR_METADATA_ONLY=1
  WASM_REAL_INI_OBJECT_RUNTIME=1
)

target_include_directories(zh_gameengine_real_ini_runtime PUBLIC
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_options(zh_gameengine_real_ini_runtime PRIVATE
  ${CNC_EXCEPTION_COMPILE_OPTION}
  -ffunction-sections
  -fdata-sections
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-invalid-offsetof
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

target_link_libraries(zh_gameengine_real_ini_runtime PUBLIC
  zh_gameengine_globaldata_runtime
)

add_library(zh_gameengine_real_object_ini_runtime STATIC
  src/wasm_object_ini_runtime.cpp
  "${GAMEENGINE_COMMON_DIR}/INI/INIObject.cpp"
  "${GAMEENGINE_COMMON_DIR}/MiniLog.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Statistics.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/ActionManager.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Player.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/ProductionPrerequisite.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/ResourceGatheringManager.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Science.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/ScoreKeeper.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Team.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/TunnelTracker.cpp"
  "${GAMEENGINE_COMMON_DIR}/Recorder.cpp"
  "${GAMEENGINE_COMMON_DIR}/StateMachine.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/BuildAssistant.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/Radar.cpp"
  "${GAMEENGINE_COMMON_DIR}/Thing/DrawModule.cpp"
  "${GAMEENGINE_COMMON_DIR}/Thing/Module.cpp"
  "${GAMEENGINE_COMMON_DIR}/Thing/ModuleFactory.cpp"
  "${GAMEENGINE_COMMON_DIR}/Thing/Thing.cpp"
  "${GAMEENGINE_COMMON_DIR}/Thing/ThingFactory.cpp"
  "${GAMEENGINE_COMMON_DIR}/Thing/ThingTemplate.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/Xfer.cpp"
  "${GAMEENGINE_COMMON_DIR}/UserPreferences.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/Common/Thing/W3DModuleFactory.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/Common/Thing/W3DThingFactory.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/Common/W3DConvert.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DDebrisDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DDefaultDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DDependencyModelDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DLaserDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DModelDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DOverlordAircraftDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DOverlordTankDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DOverlordTruckDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DPoliceCarDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DProjectileStreamDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DPropDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DRopeDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DScienceModelDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DSupplyDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DTankDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DTankTruckDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DTracerDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DTreeDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Drawable/Draw/W3DTruckDraw.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Shadow/W3DBufferManager.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Shadow/W3DProjectedShadow.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Shadow/W3DShadow.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/Shadow/W3DVolumetricShadow.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DDebugDisplay.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DDynamicLight.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DParticleSys.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DPoly.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DSnow.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DTerrainTracks.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DView.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/camerashakesystem.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/Win32Device/Common/Win32OSDisplay.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Drawable.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Drawable/Update/AnimatedParticleSysBoneClientUpdate.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Drawable/Update/BeaconClientUpdate.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Drawable/Update/SwayClientUpdate.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Eva.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/System/Anim2D.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AIDock.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AIGroup.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AIGuard.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AIGuardRetaliate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AIPathfind.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AIPlayer.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AISkirmishPlayer.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AIStates.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AITNGuard.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/Squad.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/TurretAI.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/AutoHealBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/BattleBusSlowDeathBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/BehaviorModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/BridgeBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/BridgeScaffoldBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/BridgeTowerBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/BunkerBusterBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/CountermeasuresBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/DumbProjectileBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/FireWeaponWhenDamagedBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/FireWeaponWhenDeadBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/FlightDeckBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/GenerateMinefieldBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/GrantStealthBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/InstantDeathBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/JetSlowDeathBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/MinefieldBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/NeutonBlastBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/OverchargeBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/ParkingPlaceBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/PoisonedBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/PropagandaTowerBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/RebuildHoleBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/SlowDeathBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/SpawnBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/SupplyWarehouseCripplingBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/TechBuildingBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Body/ActiveBody.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Body/BodyModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Body/HighlanderBody.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Body/HiveStructureBody.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Body/ImmortalBody.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Body/InactiveBody.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Body/StructureBody.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Body/UndeadBody.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CollideModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/ConvertToCarBombCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/ConvertToHijackedVehicleCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/CrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/HealCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/MoneyCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/SabotageCommandCenterCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/SabotageFakeBuilding.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/SabotageInternetCenterCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/SabotageMilitaryFactoryCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/SabotagePowerPlantCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/SabotageSuperweaponCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/SabotageSupplyCenterCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/SabotageSupplyDropzoneCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/SalvageCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/ShroudCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/UnitCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/CrateCollide/VeterancyCrateCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/FireWeaponCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Collide/SquishCollide.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/CaveContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/GarrisonContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/HealContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/HelixContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/InternetHackContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/MobNexusContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/OpenContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/OverlordContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/ParachuteContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/RailedTransportContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/RiderChangeContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/TransportContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Contain/TunnelContain.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Create/CreateModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Create/GrantUpgradeCreate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Create/LockWeaponCreate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Create/PreorderCreate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Create/SpecialPowerCreate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Create/SupplyCenterCreate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Create/SupplyWarehouseCreate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Create/VeterancyGainCreate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Damage/BoneFXDamage.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Damage/DamageModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Damage/TransitionDamageFX.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Die/CreateCrateDie.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Die/CreateObjectDie.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Die/CrushDie.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Die/DamDie.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Die/DestroyDie.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Die/DieModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Die/EjectPilotDie.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Die/FXListDie.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Die/KeepObjectDie.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Die/RebuildHoleExposeDie.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Die/SpecialPowerCompletionDie.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Die/UpgradeDie.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/ExperienceTracker.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/FiringTracker.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Helper/ObjectDefectionHelper.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Helper/ObjectHelper.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Helper/ObjectRepulsorHelper.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Helper/ObjectSMCHelper.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Helper/ObjectWeaponStatusHelper.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Helper/StatusDamageHelper.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Helper/SubdualDamageHelper.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Helper/TempWeaponBonusHelper.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Locomotor.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/SimpleObjectIterator.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/SpecialPower/BaikonurLaunchPower.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/SpecialPower/CashBountyPower.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/SpecialPower/CashHackSpecialPower.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/SpecialPower/CleanupAreaPower.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/SpecialPower/DefectorSpecialPower.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/SpecialPower/FireWeaponPower.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/SpecialPower/OCLSpecialPower.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/SpecialPower/SpecialAbility.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/SpecialPower/SpecialPowerModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/SpecialPower/SpyVisionSpecialPower.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/AssaultTransportAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/ChinookAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/DeliverPayloadAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/DeployStyleAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/DozerAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/HackInternetAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/JetAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/MissileAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/RailedTransportAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/RailroadGuideAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/SupplyTruckAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/TransportAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/WanderAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/WorkerAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AnimationSteeringUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AssistedTargetingUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AutoDepositUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AutoFindHealingUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/BaseRenerateUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/BattlePlanUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/BoneFXUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/CheckpointUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/CleanupHazardUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/CommandButtonHuntUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/DeletionUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/DemoTrapUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/DockUpdate/DockUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/DockUpdate/RailedTransportDockUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/DockUpdate/RepairDockUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/DockUpdate/SupplyCenterDockUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/DockUpdate/SupplyWarehouseDockUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/DynamicGeometryInfoUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/DynamicShroudClearingRangeUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/EMPUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/EnemyNearUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/FireOCLAfterWeaponCooldownUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/FireSpreadUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/FireWeaponUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/FirestormDynamicGeometryInfoUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/FlammableUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/FloatUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/HeightDieUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/HelicopterSlowDeathUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/HijackerUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/HordeUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/LaserUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/LifetimeUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/MissileLauncherBuildingUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/MobMemberSlavedUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/NeutronMissileSlowDeathUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/NeutronMissileUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/OCLUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/ParticleUplinkCannonUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/PhysicsUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/PilotFindVehicleUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/PointDefenseLaserUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/PowerPlantUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/ProductionExitUpdate/DefaultProductionExitUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/ProductionExitUpdate/QueueProductionExitUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/ProductionExitUpdate/SpawnPointProductionExitUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/ProductionExitUpdate/SupplyCenterProductionExitUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/ProductionUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/ProjectileStreamUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/ProneUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/RadarUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/RadiusDecalUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/SlavedUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/SmartBombTargetHomingUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/SpecialAbilityUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/SpecialPowerUpdateModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/SpectreGunshipDeploymentUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/SpectreGunshipUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/SpyVisionUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/StealthDetectorUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/StealthUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/StickyBombUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/StructureCollapseUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/StructureToppleUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/TensileFormationUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/ToppleUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/UpdateModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/WaveGuideUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/WeaponBonusUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/ActiveShroudUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/ArmorUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/CommandSetUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/CostModifierUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/ExperienceScalarUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/GrantScienceUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/LocomotorSetUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/MaxHealthUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/ModelConditionUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/ObjectCreationUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/PassengersFireUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/PowerPlantUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/RadarUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/ReplaceObjectUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/StatusBitsUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/StealthUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/SubObjectsUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/UnpauseSpecialPowerUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/UpgradeModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/WeaponBonusUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Upgrade/WeaponSetUpgrade.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Weapon.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/WeaponSet.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/ScriptEngine/VictoryConditions.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/System/CaveSystem.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/System/RankInfo.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/LadderDefs.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/PeerDefs.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/StagingRoomGameInfo.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/Thread/BuddyThread.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/Thread/PeerThread.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/Thread/PersistentStorageThread.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/Thread/PingThread.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpyOverlay.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/IPEnumeration.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/NAT.cpp"
)

set(ZH_OBJECT_INI_PRERTS_SOURCES
  "${GAMEENGINE_GAMECLIENT_DIR}/Drawable/Update/AnimatedParticleSysBoneClientUpdate.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Drawable/Update/BeaconClientUpdate.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Drawable/Update/SwayClientUpdate.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Eva.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/System/Anim2D.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/LadderDefs.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/PeerDefs.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/StagingRoomGameInfo.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/Thread/BuddyThread.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/Thread/PeerThread.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/Thread/PersistentStorageThread.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/Thread/PingThread.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpyOverlay.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/IPEnumeration.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/NAT.cpp"
)

target_compile_definitions(zh_gameengine_real_object_ini_runtime PRIVATE
  ${CNC_ENGINE_DEBUG_COMPILE_DEFINITIONS}
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  NO_DEBUG_CRC=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
  WASM_REAL_INI_THING_FACTORY_METADATA_ONLY=1
)

target_include_directories(zh_gameengine_real_object_ini_runtime PUBLIC
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${WWSAVELOAD_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_options(zh_gameengine_real_object_ini_runtime PRIVATE
  ${CNC_EXCEPTION_COMPILE_OPTION}
  -ffunction-sections
  -fdata-sections
  -Wno-non-pod-varargs
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-invalid-offsetof
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

target_link_libraries(zh_gameengine_real_object_ini_runtime PUBLIC
  zh_gameengine_globaldata_runtime
)


add_library(zh_gameclient_utility STATIC
  src/wasm_ini_mapped_image_compat.cpp
  "${GAMEENGINE_GAMECLIENT_DIR}/Color.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Credits.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Display.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/System/DebugDisplay.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/System/Debug Displayers/AudioDebugDisplay.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/DisplayString.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/DisplayStringManager.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/DrawGroupInfo.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Drawable.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Drawable/DrawableManager.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/DrawableManager.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Drawable/Update/AnimatedParticleSysBoneClientUpdate.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Drawable/Update/BeaconClientUpdate.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Drawable/Update/SwayClientUpdate.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Eva.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/FXList.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GraphDraw.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/AnimateWindowManager.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ChallengeGenerals.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBar.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBarBeacon.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBarCommand.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBarCommandProcessing.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBarMultiSelect.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBarOCLTimer.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBarObserver.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBarScheme.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBarPrintPositions.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBarResizer.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBarStructureInventory.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBarUnderConstruction.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Gadget/GadgetCheckBox.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Gadget/GadgetComboBox.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Gadget/GadgetHorizontalSlider.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Gadget/GadgetListBox.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Gadget/GadgetProgressBar.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Gadget/GadgetPushButton.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Gadget/GadgetRadioButton.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Gadget/GadgetStaticText.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Gadget/GadgetTabControl.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Gadget/GadgetTextEntry.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Gadget/GadgetVerticalSlider.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/DisconnectMenu/DisconnectMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/EstablishConnectionsMenu/EstablishConnectionsMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/ControlBarCallback.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/ControlBarPopupDescription.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Diplomacy.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/ExtendedMessageBox.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/GeneralsExpPoints.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/IMECandidate.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/InGameChat.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/InGamePopupMessage.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/ChallengeMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/CreditsMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/DifficultySelect.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/DisconnectWindow.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/DownloadMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/EstablishConnectionsWindow.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/GameInfoWindow.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/KeyboardOptionsMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/LanGameOptionsMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/LanLobbyMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/LanMapSelectMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/MainMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/MapSelectMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/NetworkDirectConnect.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/OptionsMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/PopupCommunicator.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/PopupHostGame.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/PopupJoinGame.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/PopupLadderSelect.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/PopupPlayerInfo.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/PopupReplay.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/PopupSaveLoad.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/QuitMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/ReplayMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/ScoreScreen.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/SinglePlayerMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/SkirmishGameOptionsMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/SkirmishMapSelectMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLBuddyOverlay.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLCustomScoreScreen.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLGameSetupMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLLadderScreen.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLLobbyMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLLoginMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLLocaleSelectPopup.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLMapSelectMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLMessageWindow.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLQMScoreScreen.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLQuickMatchMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLStatusMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLWelcomeMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/MessageBox.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/ReplayControls.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GameFont.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GameWindow.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GameWindowGlobal.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GameWindowManager.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GameWindowManagerScript.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GameWindowTransitions.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GameWindowTransitionsStyles.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/HeaderTemplate.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/IMEManager.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/LoadScreen.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ProcessAnimateWindow.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Shell/Shell.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Shell/ShellMenuScheme.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/WinInstanceData.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/WindowLayout.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/WindowVideoManager.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GameClient.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GlobalLanguage.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GameClientDispatch.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GameText.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/InGameUI.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Input/Keyboard.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Input/Mouse.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/MessageStream/GUICommandTranslator.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/MessageStream/CommandXlat.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/MessageStream/HintSpy.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/MessageStream/HotKey.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/MessageStream/LookAtXlat.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/MessageStream/MetaEvent.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/MessageStream/PlaceEventTranslator.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/MessageStream/SelectionXlat.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/MessageStream/WindowXlat.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/System/CampaignManager.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIAnimation.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INICommandButton.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIMappedImage.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIVideo.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIWater.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/LanguageFilter.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Line2D.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/MapUtil.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/ParabolicEase.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/RadiusDecal.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/SelectionInfo.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Snow.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Statistics.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/System/Anim2D.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/System/Image.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/System/ParticleSys.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/System/RayEffect.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/System/Smudge.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Terrain/TerrainRoads.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Terrain/TerrainVisual.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/View.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/VideoPlayer.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/VideoStream.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Water.cpp"
)

set_source_files_properties("${GAMEENGINE_GAMECLIENT_DIR}/VideoStream.cpp" PROPERTIES
  COMPILE_OPTIONS "-include;${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
)

set_property(SOURCE "${GAMEENGINE_GAMECLIENT_DIR}/GUI/LoadScreen.cpp" APPEND PROPERTY
  COMPILE_DEFINITIONS CNC_PORT_LOAD_SCREEN_MOVIE_TEST_HOOKS=1
)

target_include_directories(zh_gameclient_utility PUBLIC
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWMATH_DIR}"
  "${WWLIB_DIR}"
  "${WWSAVELOAD_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_definitions(zh_gameclient_utility PRIVATE
  CNC_PORT_LINKS_REAL_INI_COMPAT_OWNERS=1
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(zh_gameclient_utility PRIVATE
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_webbrowser_boundary.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

target_link_libraries(zh_gameclient_utility PUBLIC
  zh_gameengine_common_core
)

add_library(zh_gameclient_gui_input_runtime STATIC
  "${GAMEENGINE_GAMECLIENT_DIR}/Color.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Gadget/GadgetCheckBox.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Gadget/GadgetComboBox.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Gadget/GadgetHorizontalSlider.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Gadget/GadgetListBox.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Gadget/GadgetProgressBar.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Gadget/GadgetPushButton.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Gadget/GadgetRadioButton.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Gadget/GadgetStaticText.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Gadget/GadgetTabControl.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Gadget/GadgetTextEntry.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Gadget/GadgetVerticalSlider.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GameWindow.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GameWindowGlobal.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GameWindowManager.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GameWindowTransitions.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/WindowLayout.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/WinInstanceData.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Input/Mouse.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/MessageStream/WindowXlat.cpp"
)

target_include_directories(zh_gameclient_gui_input_runtime PUBLIC
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWMATH_DIR}"
  "${WWLIB_DIR}"
  "${WWSAVELOAD_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_definitions(zh_gameclient_gui_input_runtime PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(zh_gameclient_gui_input_runtime PRIVATE
  -fms-extensions
  -ffunction-sections
  -fdata-sections
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
)

target_link_libraries(zh_gameclient_gui_input_runtime PUBLIC
  zh_gameengine_common_core
)

add_library(zh_window_layout_script_runtime STATIC
  src/wasm_game_state_time_helper.cpp
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GameWindowManagerScript.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/HeaderTemplate.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/IMECandidate.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/MessageBox.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/DifficultySelect.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/KeyboardOptionsMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/PopupReplay.cpp"
)

target_include_directories(zh_window_layout_script_runtime PUBLIC
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${WWSAVELOAD_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_definitions(zh_window_layout_script_runtime PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(zh_window_layout_script_runtime PRIVATE
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -ffunction-sections
  -fdata-sections
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-logical-not-parentheses
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

target_link_libraries(zh_window_layout_script_runtime PUBLIC
  zh_gameclient_gui_input_runtime
  zh_gameclient_text
)

add_library(zh_win32_mouse_browser_real STATIC
  "${GAMEENGINE_DEVICE_DIR}/Source/Win32Device/GameClient/Win32Mouse.cpp"
)

target_include_directories(zh_win32_mouse_browser_real PUBLIC
  "${WASM_SHIMS_DIR}"
  "${MAIN_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWMATH_DIR}"
  "${WWLIB_DIR}"
  "${WWSAVELOAD_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_definitions(zh_win32_mouse_browser_real PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(zh_win32_mouse_browser_real PRIVATE
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-new-returns-null
  -Wno-register
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
)

target_link_libraries(zh_win32_mouse_browser_real PUBLIC
  zh_gameclient_utility
)

add_library(zh_winmain_wndproc_browser STATIC
  "${MAIN_DIR}/WinMain.cpp"
)

target_include_directories(zh_winmain_wndproc_browser PUBLIC
  "${WINMAIN_WNDPROC_SHIMS_DIR}"
  "${WIN32_GAMEENGINE_SHIMS_DIR}"
  "${WASM_SHIMS_DIR}"
  "${MAIN_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${WWVEGAS_DIR}"
  "${WWMATH_DIR}"
  "${WWLIB_DIR}"
)

target_compile_definitions(zh_winmain_wndproc_browser PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(zh_winmain_wndproc_browser PRIVATE
  -DCNC_WASM_WNDPROC_ONLY
  -DCNC_WASM_WNDPROC_EXTERNAL_GLOBALS
  -DCNC_WASM_ENABLE_CREATEGAMEENGINE
  -include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h
  "-iquote${WINMAIN_WNDPROC_SHIMS_DIR}"
  "-iquote${WIN32_GAMEENGINE_SHIMS_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-new-returns-null
  -Wno-register
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

target_link_libraries(zh_winmain_wndproc_browser PUBLIC
  zh_win32_mouse_browser_real
)

add_library(zh_win32_gameengine_message_pump STATIC
  "${GAMEENGINE_DEVICE_DIR}/Source/Win32Device/Common/Win32GameEngine.cpp"
)

target_include_directories(zh_win32_gameengine_message_pump PUBLIC
  "${WIN32_GAMEENGINE_SHIMS_DIR}"
  "${WASM_SHIMS_DIR}"
  "${MAIN_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWMATH_DIR}"
  "${WWLIB_DIR}"
  "${WWSAVELOAD_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_definitions(zh_win32_gameengine_message_pump PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(zh_win32_gameengine_message_pump PRIVATE
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${WIN32_GAMEENGINE_SHIMS_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-new-returns-null
  -Wno-register
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

add_library(zh_gameengine_original_lifetime STATIC
  "${GAMEENGINE_COMMON_DIR}/GameEngine.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Science.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/SubsystemInterface.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/System/RankInfo.cpp"
)

target_include_directories(zh_gameengine_original_lifetime PUBLIC
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${WWVEGAS_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${WASM_SHIMS_DIR}"
)

target_compile_definitions(zh_gameengine_original_lifetime PRIVATE
  __PRERTS_H__
)

target_compile_options(zh_gameengine_original_lifetime PRIVATE
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WASM_SHIMS_DIR}"
  -ffunction-sections
  -fdata-sections
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

add_library(zh_gameengine_original_drawable_lifetime STATIC
  "${GAMEENGINE_GAMECLIENT_DIR}/Drawable.cpp"
)

target_include_directories(zh_gameengine_original_drawable_lifetime PUBLIC
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${WWSAVELOAD_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
  "${WASM_SHIMS_DIR}"
)

target_compile_definitions(zh_gameengine_original_drawable_lifetime PRIVATE
  __PRERTS_H__
)

target_compile_options(zh_gameengine_original_drawable_lifetime PRIVATE
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  "-iquote${WASM_SHIMS_DIR}"
  -ffunction-sections
  -fdata-sections
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-invalid-offsetof
  -Wno-logical-not-parentheses
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

add_library(zh_gamenetwork_core STATIC
  "${GAMEENGINE_GAMENETWORK_DIR}/Connection.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/ConnectionManager.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/DisconnectManager.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/DownloadManager.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/FileTransfer.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/FrameData.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/FrameDataManager.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/FrameMetrics.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameInfo.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameMessageParser.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/FirewallHelper.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/GSConfig.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GUIUtil.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/LANAPI.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/LANAPICallbacks.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/LANAPIhandlers.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/LANGameInfo.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/NetCommandList.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/NetCommandMsg.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/NetCommandRef.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/NetCommandWrapperList.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/NetMessageStream.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/NetPacket.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/NetworkUtil.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/Transport.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/udp.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/User.cpp"
)

target_include_directories(zh_gamenetwork_core PUBLIC
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWMATH_DIR}"
  "${WWLIB_DIR}"
  "${WWSAVELOAD_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_definitions(zh_gamenetwork_core PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(zh_gamenetwork_core PRIVATE
  -ffunction-sections
  -fdata-sections
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
)

target_link_libraries(zh_gamenetwork_core PUBLIC
  zh_gameengine_common_core
  zh_wwdownload
)

# Real engine lifecycle runtime: the original boot path (WinMain.cpp
# CreateGameEngine -> Win32GameEngine -> GameEngine::init()) plus the remaining
# original GameClient/GameLogic/GameNetwork/W3DDevice sources that path links,
# compiled for cnc-port so the browser runtime drives the real engine
# lifecycle instead of hand-authored probe frontiers.
add_library(zh_gameengine_real_lifecycle_runtime STATIC
  "${GAMEENGINE_COMMON_DIR}/CRCDebug.cpp"
  "${GAMEENGINE_COMMON_DIR}/GameEngine.cpp"
  "${GAMEENGINE_COMMON_DIR}/GameMain.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIAnimation.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIWebpageURL.cpp"
  "${GAMEENGINE_COMMON_DIR}/SkirmishBattleHonors.cpp"
  "${GAMEENGINE_COMMON_DIR}/StatsCollector.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/FunctionLexicon.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/SaveGame/GameState.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/SaveGame/GameStateMap.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/XferLoad.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/XferSave.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Credits.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Display.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/DisplayStringManager.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Drawable/DrawableManager.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/AnimateWindowManager.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBar.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBarBeacon.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBarCommand.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBarCommandProcessing.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBarMultiSelect.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBarOCLTimer.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBarObserver.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBarPrintPositions.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBarResizer.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBarStructureInventory.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBarUnderConstruction.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/DisconnectMenu/DisconnectMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/EstablishConnectionsMenu/EstablishConnectionsMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/ControlBarCallback.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/ControlBarPopupDescription.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Diplomacy.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/ExtendedMessageBox.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/GeneralsExpPoints.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/InGameChat.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/InGamePopupMessage.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/ChallengeMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/CreditsMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/DisconnectWindow.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/DownloadMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/EstablishConnectionsWindow.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/GameInfoWindow.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/LanGameOptionsMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/LanLobbyMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/LanMapSelectMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/MainMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/MapSelectMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/NetworkDirectConnect.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/OptionsMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/PopupCommunicator.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/PopupHostGame.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/PopupJoinGame.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/PopupLadderSelect.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/PopupPlayerInfo.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/PopupSaveLoad.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/QuitMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/ReplayMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/ScoreScreen.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/SinglePlayerMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/SkirmishGameOptionsMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/SkirmishMapSelectMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLBuddyOverlay.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLCustomScoreScreen.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLGameSetupMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLLadderScreen.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLLobbyMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLLocaleSelectPopup.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLLoginMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLMapSelectMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLMessageWindow.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLQMScoreScreen.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLQuickMatchMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLStatusMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLWelcomeMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/ReplayControls.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GameWindowTransitionsStyles.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/IMEManager.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/LoadScreen.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ProcessAnimateWindow.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Shell/Shell.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Shell/ShellMenuScheme.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/WindowVideoManager.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GameClient.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GameClientDispatch.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GraphDraw.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/InGameUI.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Input/Keyboard.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/MapUtil.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/MessageStream/CommandXlat.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/MessageStream/GUICommandTranslator.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/MessageStream/HintSpy.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/MessageStream/LookAtXlat.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/MessageStream/MetaEvent.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/MessageStream/PlaceEventTranslator.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/MessageStream/SelectionXlat.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/ParabolicEase.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/SelectionInfo.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/System/CampaignManager.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/System/DebugDisplay.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/System/RayEffect.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/VideoStream.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/View.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AIPlayer.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AISkirmishPlayer.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/POWTruckBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/PrisonBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Behavior/PropagandaCenterBehavior.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Destroy/DestroyModule.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/GhostObject.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Object.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/SpecialPower/DemoralizeSpecialPower.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/AIUpdate/POWTruckAIUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Update/DockUpdate/PrisonDockUpdate.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/ScriptEngine/ScriptActions.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/ScriptEngine/ScriptConditions.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/System/GameLogic.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/System/GameLogicDispatch.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/LobbyUtils.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/MainMenuUtils.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/Thread/GameResultsThread.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/Thread/ThreadUtils.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpyChat.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpyGP.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/Network.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/Common/System/W3DRadar.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/GUICallbacks/W3DControlBar.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/GUICallbacks/W3DMOTD.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/GUICallbacks/W3DMainMenu.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DAssetManagerExposed.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DCustomEdging.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DDebugIcons.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DDisplayStringManager.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DGameClient.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DGranny.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DInGameUI.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DMouse.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DWebBrowser.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameLogic/W3DGameLogic.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameLogic/W3DGhostObject.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/Win32Device/Common/Win32CDManager.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/Win32Device/Common/Win32GameEngine.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/CopyProtection.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/System/Debug Displayers/AudioDebugDisplay.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/Win32Device/GameClient/Win32DIKeyboard.cpp"
)

target_compile_definitions(zh_gameengine_real_lifecycle_runtime PRIVATE
  ${CNC_ENGINE_DEBUG_COMPILE_DEFINITIONS}
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  NO_DEBUG_CRC=1
)

target_include_directories(zh_gameengine_real_lifecycle_runtime PUBLIC
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWVEGAS_DIR}/Miles6/include"
  "${WWAUDIO_DIR}"
  "${WWDEBUG_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${WWSAVELOAD_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_options(zh_gameengine_real_lifecycle_runtime PRIVATE
  ${CNC_EXCEPTION_COMPILE_OPTION}
  -ffunction-sections
  -fdata-sections
  -Wno-non-pod-varargs
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_webbrowser_boundary.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWVEGAS_DIR}/Miles6/include"
  "-iquote${WWAUDIO_DIR}"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-invalid-offsetof
  -Wno-logical-not-parentheses
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

target_link_libraries(zh_gameengine_real_lifecycle_runtime PUBLIC
  zh_gameengine_globaldata_runtime
)

set_source_files_properties("${GAMEENGINE_DEVICE_DIR}/Source/Win32Device/Common/Win32CDManager.cpp" PROPERTIES
  COMPILE_OPTIONS "-Wno-implicit-exception-spec-mismatch;-Wno-new-returns-null;-Wno-undefined-bool-conversion"
)

set_source_files_properties("${GAMEENGINE_GAMECLIENT_DIR}/DrawGroupInfo.cpp" PROPERTIES
  COMPILE_OPTIONS "-include${WWVEGAS_PORT_SHIM};-include${GAMEENGINE_INCLUDE_DIR}/Common/INI.h"
)

add_executable(cnc-port
  src/wasm_browser_boundary_shims.cpp
  src/wasm_archive_probe.cpp
  src/wasm_benchmark_shim.cpp
  src/wasm_browser_boundary_shims.cpp
  src/wasm_browser_runtime_assets.cpp
  src/wasm_agent_api.cpp
  src/wasm_cdmanager_probe.cpp
  src/wasm_filesystem_probe.cpp
  src/wasm_gamenetwork_probe.cpp
  src/wasm_gui_mouse_stream_probe.cpp
  src/wasm_keyboard_probe.cpp
  src/wasm_launchweb_probe.cpp
  src/wasm_url_launch_probe.cpp
  src/wasm_mss_startup_probe.cpp
  src/wasm_mss_sample_lifecycle_probe.cpp
  src/wasm_mss_stream_lifecycle_probe.cpp
  src/wasm_mss_3d_sample_lifecycle_probe.cpp
  src/wasm_audio_manager_probe.cpp
  src/wasm_function_lexicon_runtime.cpp
  src/wasm_dinput_browser.cpp
  src/wasm_module_factory_runtime.cpp
  src/wasm_particle_system_runtime.cpp
  src/wasm_port_entry.cpp
  src/wasm_real_engine_init.cpp
  src/wasm_win32_gameengine_probe.cpp
  src/wasm_wndproc_probe.cpp
  src/wasm_win32_gdi_browser.cpp
  src/wasm_classic_environment_mapper_probe.cpp
  src/wasm_edge_mapper_probe.cpp
  src/wasm_environment_mapper_probe.cpp
  src/wasm_grid_environment_mapper_probe.cpp
  src/wasm_grid_ws_environment_mapper_probe.cpp
  src/wasm_matrixmapper_probe.cpp
  src/wasm_projection_state_probe.cpp
  src/wasm_screen_mapper_probe.cpp
  src/wasm_startup_singletons_probe.cpp
  src/wasm_ws_environment_mapper_probe.cpp
  src/wasm_ww3d_font_chars_probe.cpp
  src/wasm_ww3d_render_probe.cpp
  src/wasm_ww3d_scene_probe.cpp
  src/wasm_ww3d_source_asset_probe.cpp
  src/wasm_ww3d_terrain_probe.cpp
  src/wasm_ww3d_terrain_probe_stubs.cpp
  src/wasm_ww3d_textured_mesh_probe.cpp
  src/wasm_wwshade_probe.cpp
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DFileSystem.cpp"
)

set_target_properties(cnc-port PROPERTIES
  OUTPUT_NAME "cnc-port"
  SUFFIX ".js"
)

add_dependencies(cnc-port cnc_port_ww3d_asset_headers)

set_source_files_properties(src/wasm_wndproc_probe.cpp PROPERTIES
  COMPILE_OPTIONS "-iquote${WINMAIN_WNDPROC_SHIMS_DIR};-iquote${WIN32_GAMEENGINE_SHIMS_DIR}"
)

set_source_files_properties(src/wasm_win32_gameengine_probe.cpp PROPERTIES
  COMPILE_OPTIONS "-include${WASM_SHIMS_DIR}/atlbase.h;-Wno-implicit-exception-spec-mismatch;-Wno-new-returns-null;-Wno-undefined-bool-conversion"
)

set_source_files_properties(src/wasm_audio_manager_probe.cpp PROPERTIES
  COMPILE_OPTIONS "-include${WASM_SHIMS_DIR}/windows.h;-include${WASM_SHIMS_DIR}/mmsystem.h;-include${WWVEGAS_PORT_SHIM};-iquote${GAMEENGINE_INCLUDE_DIR};-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled;-iquote${GAMEENGINE_DIR}/Source;-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR};-iquote${MAIN_DIR};-iquote${ZH_LIB_INCLUDE_DIR};-iquote${ZH_CODE_DIR}/Libraries/Source;-iquote${WWVEGAS_DIR};-iquote${WWVEGAS_DIR}/Miles6/include;-iquote${WWAUDIO_DIR};-iquote${WWVEGAS_DIR}/WW3D2;-iquote${WWDEBUG_DIR};-iquote${WWLIB_DIR};-iquote${WWMATH_DIR};-iquote${WWSAVELOAD_DIR};-iquote${COMPRESSION_DIR};-iquote${COMPRESSION_EAC_DIR};-Wno-implicit-exception-spec-mismatch;-Wno-new-returns-null;-Wno-undefined-bool-conversion"
)

set_source_files_properties(src/wasm_startup_singletons_probe.cpp PROPERTIES
  COMPILE_OPTIONS "-include${WASM_SHIMS_DIR}/windows.h;-include${WASM_SHIMS_DIR}/mmsystem.h;-include${WWVEGAS_PORT_SHIM};-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h;-iquote${GAMEENGINE_INCLUDE_DIR};-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled;-iquote${GAMEENGINE_DIR}/Source;-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR};-iquote${MAIN_DIR};-iquote${ZH_LIB_INCLUDE_DIR};-iquote${ZH_CODE_DIR}/Libraries/Source;-iquote${WWVEGAS_DIR};-iquote${WWVEGAS_DIR}/WW3D2;-iquote${WWDEBUG_DIR};-iquote${WWLIB_DIR};-iquote${WWMATH_DIR};-iquote${WWSAVELOAD_DIR};-iquote${COMPRESSION_DIR};-iquote${COMPRESSION_EAC_DIR};-Wno-implicit-exception-spec-mismatch;-Wno-new-returns-null;-Wno-undefined-bool-conversion;-Wno-unused-parameter"
)

set_source_files_properties(src/wasm_real_engine_init.cpp PROPERTIES
  COMPILE_DEFINITIONS CNC_PORT_REAL_GAMELOGIC_HEADER=1
  COMPILE_OPTIONS "-include${WASM_SHIMS_DIR}/windows.h;-include${WASM_SHIMS_DIR}/mmsystem.h;-include${WWVEGAS_PORT_SHIM};-include${WASM_SHIMS_DIR}/atlbase.h;-iquote${GAMEENGINE_INCLUDE_DIR};-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled;-iquote${GAMEENGINE_DIR}/Source;-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR};-iquote${MAIN_DIR};-iquote${ZH_LIB_INCLUDE_DIR};-iquote${ZH_CODE_DIR}/Libraries/Source;-iquote${WWVEGAS_DIR};-iquote${WWVEGAS_DIR}/Miles6/include;-iquote${WWAUDIO_DIR};-iquote${WWVEGAS_DIR}/WW3D2;-iquote${WWDEBUG_DIR};-iquote${WWLIB_DIR};-iquote${WWMATH_DIR};-iquote${WWSAVELOAD_DIR};-iquote${COMPRESSION_DIR};-iquote${COMPRESSION_EAC_DIR};-Wno-implicit-exception-spec-mismatch;-Wno-new-returns-null;-Wno-undefined-bool-conversion;-Wno-unused-parameter"
)

set_source_files_properties(src/wasm_function_lexicon_runtime.cpp PROPERTIES
  COMPILE_OPTIONS "-Wno-implicit-exception-spec-mismatch;-Wno-new-returns-null;-Wno-undefined-bool-conversion;-Wno-unused-parameter"
)

set_source_files_properties(src/wasm_module_factory_runtime.cpp PROPERTIES
  COMPILE_OPTIONS "-Wno-implicit-exception-spec-mismatch;-Wno-new-returns-null;-Wno-undefined-bool-conversion;-Wno-unused-parameter"
)

set_source_files_properties(src/wasm_particle_system_runtime.cpp PROPERTIES
  COMPILE_OPTIONS "-Wno-implicit-exception-spec-mismatch;-Wno-new-returns-null;-Wno-undefined-bool-conversion;-Wno-unused-parameter"
)

set_source_files_properties(src/wasm_ww3d_terrain_probe.cpp PROPERTIES
  COMPILE_OPTIONS "-Wno-non-pod-varargs;-iquote${GAMEENGINE_INCLUDE_DIR};-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled;-iquote${GAMEENGINE_DIR}/Source;-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR};-iquote${MAIN_DIR};-iquote${ZH_LIB_INCLUDE_DIR};-iquote${ZH_CODE_DIR}/Libraries/Source;-iquote${WWVEGAS_DIR};-iquote${WWVEGAS_DIR}/WW3D2;-iquote${WWDEBUG_DIR};-iquote${WWLIB_DIR};-iquote${WWMATH_DIR};-iquote${WWSAVELOAD_DIR};-iquote${COMPRESSION_DIR};-iquote${COMPRESSION_EAC_DIR}"
)

set_source_files_properties(src/wasm_ww3d_scene_probe.cpp PROPERTIES
  COMPILE_DEFINITIONS CNC_PORT_REAL_GAMELOGIC_HEADER=1
  COMPILE_OPTIONS "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h;-Wno-non-pod-varargs;-iquote${GAMEENGINE_INCLUDE_DIR};-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled;-iquote${GAMEENGINE_DIR}/Source;-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR};-iquote${MAIN_DIR};-iquote${ZH_LIB_INCLUDE_DIR};-iquote${ZH_CODE_DIR}/Libraries/Source;-iquote${WWVEGAS_DIR};-iquote${WWVEGAS_DIR}/WW3D2;-iquote${WWDEBUG_DIR};-iquote${WWLIB_DIR};-iquote${WWMATH_DIR};-iquote${WWSAVELOAD_DIR};-iquote${COMPRESSION_DIR};-iquote${COMPRESSION_EAC_DIR}"
)

set_source_files_properties(
  src/wasm_edge_mapper_probe.cpp
  src/wasm_gui_mouse_stream_probe.cpp
  src/wasm_ww3d_render_probe.cpp
  PROPERTIES
  COMPILE_DEFINITIONS CNC_PORT_REAL_GAMELOGIC_HEADER=1
  COMPILE_OPTIONS "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h;-iquote${GAMEENGINE_INCLUDE_DIR};-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled;-iquote${GAMEENGINE_DIR}/Source;-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR};-iquote${MAIN_DIR};-iquote${ZH_LIB_INCLUDE_DIR};-iquote${ZH_CODE_DIR}/Libraries/Source;-iquote${WWVEGAS_DIR};-iquote${WWVEGAS_DIR}/WW3D2;-iquote${WWDEBUG_DIR};-iquote${WWLIB_DIR};-iquote${WWMATH_DIR};-iquote${WWSAVELOAD_DIR};-iquote${COMPRESSION_DIR};-iquote${COMPRESSION_EAC_DIR}"
)

set_source_files_properties("${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/W3DFileSystem.cpp" PROPERTIES
  COMPILE_OPTIONS "-include${WASM_SHIMS_DIR}/windows.h;-include${WWVEGAS_PORT_SHIM};-iquote${GAMEENGINE_INCLUDE_DIR};-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled;-iquote${GAMEENGINE_DIR}/Source;-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR};-iquote${ZH_LIB_INCLUDE_DIR};-iquote${ZH_CODE_DIR}/Libraries/Source;-iquote${WWVEGAS_DIR};-iquote${WWVEGAS_DIR}/WW3D2;-iquote${WWDEBUG_DIR};-iquote${WWLIB_DIR};-iquote${WWMATH_DIR};-iquote${COMPRESSION_DIR};-iquote${COMPRESSION_EAC_DIR}"
)

target_compile_definitions(cnc-port PRIVATE
  CNC_PORT_LINKS_BROWSER_BENCHMARK_SHIM=1
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  CNC_PORT_LINKS_REAL_GAMENETWORK_OWNERS=1
  CNC_PORT_LINKS_REAL_MINIMUM_REQUIREMENTS=1
  CNC_PORT_LINKS_REAL_SCRIPT_ACTIONS_SINGLETON=1
  CNC_PORT_LINKS_REAL_SCRIPT_ENGINE_SINGLETON=1
  CNC_PORT_LINKS_REAL_WNDPROC_SINGLETONS=1
  CNC_PORT_LINKS_REAL_W3D_RENDER_MENU_CALLBACK_HELPERS=1
  CNC_PORT_LINKS_REAL_W3D_SCENE_EXTRA_PASSES=1
  CNC_PORT_LINKS_REAL_W3D_SCENE_GAMEPLAY_METHODS=1
  CNC_PORT_LINKS_REAL_W3D_SCENE_PARTICLE_QUEUE=1
  CNC_PORT_LINKS_REAL_W3D_SCENE_SINGLETONS=1
  CNC_PORT_LINKS_REAL_W3D_TERRAIN_OWNERS=1
  CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_AI_PATHFIND_RUNTIME=1
  CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_BRIDGE_SCRIPT_RUNTIME=1
  CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_GAMEPLAY_QUERY_HELPERS=1
  CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_OBJECT_HELPERS=1
  CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_PLAYER_DRAWABLE_HELPERS=1
  CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_PROJECTED_SHADOW_TRACKS_RUNTIME=1
  CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_RADAR_RESOURCE_RUNTIME=1
  CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_SHADOW_RUNTIME=1
  CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_SNOW_ITERATOR_OBJECT_HELPERS=1
  CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_SINGLETONS=1
  CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_TEAM_RUNTIME=1
  CNC_PORT_LINKS_REAL_W3D_TERRAIN_STUB_WATER_RUNTIME=1
  CNC_PORT_LINKS_REAL_W3D_MAIN_MENU=1
  CNC_PORT_TERRAIN_PROBE_USE_ORIGINAL_THING_FACTORY=1
  ${CNC_ENGINE_DEBUG_COMPILE_DEFINITIONS}
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(cnc-port PRIVATE
  ${CNC_EXCEPTION_COMPILE_OPTION}
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-non-pod-varargs
  -Wno-register
  -Wno-writable-strings
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_webbrowser_boundary.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/Miles6/include"
  "-iquote${WWAUDIO_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
)

target_include_directories(cnc-port PRIVATE
  "${WW3D_SOURCE_ASSET_GENERATED_DIR}"
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${WWLIB_DIR}"
)

target_link_libraries(cnc-port PRIVATE
  zh_gameengine_real_lifecycle_runtime
  zh_bink_video_device_compile_frontier
  zh_w3d_terrain_probe_runtime
  zh_w3d_scene_probe_runtime
  zh_w3d_display_drawimage_runtime
  zh_wwshade_compile_frontier
  zh_ww3d2_compile_frontier
  zh_window_layout_script_runtime
  zh_miles_audio_device_compile_frontier
  zh_gameengine_audio_runtime
  zh_gameengine_real_object_ini_runtime
  zh_gameengine_real_ini_runtime
  zh_gameengine_globaldata_runtime
  zh_gameengine_common_core
  zh_gameclient_text
  zh_gameengine_debug_runtime
  zh_wwdebug_core
  zh_browser_d3d8
  zh_winmain_wndproc_browser
  zh_gamenetwork_core
  zh_wwmath_lookup
  zh_wwmath_core
  zh_wwsaveload_full
  zh_wwsaveload_core
  zh_wwlib_file_ini
  zh_wwlib_file_core
  zh_wwlib_stream_core
  zh_wwlib_string
  zh_wwlib_refcount
  zh_wwlib_containers
  zh_wwlib_crc
  zh_wwlib_cpudetect
  zh_wwlib_random
  zh_wwlib_thread
  zh_wwlib_mutex
  zh_wwlib_targa
  zh_wwlib_launchweb
  zh_wwdebug_profile
  zh_compression_manager
  zh_compression_eac
)

# cnc-port heap shape (P3, notes/p1-engine-thread.md "P3 results"):
#
# - Default (non-threaded) build: unchanged — small INITIAL_MEMORY with
#   ALLOW_MEMORY_GROWTH up to the 2GiB MAXIMUM. Growth is cheap on a
#   single-threaded build (views are refreshed at the JS/wasm boundary).
# - Threaded (CNC_PORT_THREADS) build: FIXED-SIZE heap. pthreads +
#   ALLOW_MEMORY_GROWTH forces every JS-side HEAP view access through
#   growth-check wrappers (the em++ -Wpthreads-mem-growth warning: "may run
#   non-wasm code slowly") because a growable SharedArrayBuffer is replaced
#   under running JS on every grow. With growth OFF the SAB never moves and
#   plain typed-array views stay valid for the page lifetime.
#   INITIAL_MEMORY is set EQUAL to the default build's MAXIMUM_MEMORY (2GiB):
#   the OOM ceiling is identical to the growth build, so no workload that
#   survives growth-on can newly abort under the fixed heap. Browsers commit
#   shared wasm memory pages lazily (verified on dev-box Chromium: renderer
#   RSS tracks touched pages, not the 2GiB reservation), so the up-front cost
#   is address space, not resident memory. Measured usage (2026-07-10,
#   growth-on threaded build, OPFS mounts): 0.16GiB at title; see
#   notes/p1-engine-thread.md "P3 results" for the in-match sizing runs.
if(CNC_PORT_THREADS)
  set(CNC_PORT_MEMORY_LINK_OPTIONS
    "SHELL:-sALLOW_MEMORY_GROWTH=0"
    "SHELL:-sINITIAL_MEMORY=2147483648"
  )
else()
  set(CNC_PORT_MEMORY_LINK_OPTIONS
    "SHELL:-sALLOW_MEMORY_GROWTH=1"
    "SHELL:-sINITIAL_MEMORY=67108864"
    "SHELL:-sMAXIMUM_MEMORY=2147483648"
  )
endif()

target_link_options(cnc-port PRIVATE
  "SHELL:-Wl,--gc-sections"
  "SHELL:-sERROR_ON_UNDEFINED_SYMBOLS=1"
  "SHELL:-sWARN_ON_UNDEFINED_SYMBOLS=1"
  "SHELL:--no-entry"
  "SHELL:-sMODULARIZE=1"
  "SHELL:-sEXPORT_ES6=1"
  "SHELL:-sEXPORT_NAME=createCncPortModule"
  "SHELL:-sENVIRONMENT=web,worker"
  ${CNC_PORT_MEMORY_LINK_OPTIONS}
  "SHELL:-sTOTAL_STACK=1048576"
  # IDBFS backs the in-game save directory with IndexedDB so the ".sav" files
  # written by the real GameState / XferSave path survive a page reload. Without
  # this link flag the engine's save/load logic works but persists only to
  # volatile MEMFS, which is wiped on reload. The JS bridge mounts IDBFS at the
  # save directory in preRun and calls FS.syncfs to load/persist. IDBFS is not
  # included by default in emscripten 3.1.6, so it must be requested here.
  "SHELL:-lidbfs.js"
  ${CNC_ASSERTIONS_LINK_OPTION}
  ${CNC_EXCEPTION_LINK_OPTION}
  "SHELL:-sEXPORTED_FUNCTIONS=['_cnc_port_boot','_cnc_port_real_engine_set_resolution','_cnc_port_real_engine_init','_cnc_port_real_engine_shutdown','_cnc_port_real_engine_frame','_cnc_port_real_engine_frame_summary','_cnc_port_real_engine_set_player_diagnostics','_cnc_port_query_drawables','_cnc_port_query_selection','_cnc_port_real_engine_frontier','_cnc_port_map_cache_probe','_cnc_port_frame','_cnc_port_start_main_loop','_cnc_port_stop_main_loop','_cnc_port_probe_archive','_cnc_port_register_archive_set','_cnc_port_set_browser_input','_cnc_port_set_browser_input_lite','_cnc_port_reset_browser_input','_cnc_port_post_browser_message','_cnc_port_post_browser_message_lite','_cnc_port_probe_browser_message_queue','_cnc_port_probe_browser_input','_cnc_port_build_browser_network_relay_packet','_cnc_port_accept_browser_network_relay_packet','_cnc_port_build_browser_network_transport_packet','_cnc_port_accept_browser_network_transport_packet','_cnc_port_build_browser_network_transport_wire_packet','_cnc_port_accept_browser_network_transport_wire_packet','_cnc_port_probe_browser_network_transport_live_send','_cnc_port_probe_browser_network_transport_live_receive','_cnc_port_build_browser_lanapi_announce_packet','_cnc_port_accept_browser_lanapi_announce_packet','_cnc_port_build_browser_lanapi_join_request_packet','_cnc_port_accept_browser_lanapi_join_request_packet','_cnc_port_accept_browser_lanapi_join_accept_packet','_cnc_port_probe_browser_lanapi_live_game_start_send','_cnc_port_probe_browser_lanapi_live_game_start_receive','_cnc_port_probe_win32_gameengine','_cnc_port_probe_mss_startup','_cnc_port_probe_mss_sample_lifecycle','_cnc_port_probe_mss_sample_playback_start','_cnc_port_probe_mss_sample_playback_finish','_cnc_port_probe_mss_stream_lifecycle','_cnc_port_probe_mss_3d_sample_lifecycle','_cnc_port_probe_d3d8_clear','_cnc_port_probe_d3d8_viewport','_cnc_port_probe_d3d8_buffer_dirty','_cnc_port_probe_d3d8_buffer_hints','_cnc_port_probe_d3d8_texture_upload','_cnc_port_probe_d3d8_volume_texture_upload','_cnc_port_probe_d3d8_texture_bind','_cnc_port_probe_d3d8_textured_quad','_cnc_port_probe_d3d8_two_texture_quad','_cnc_port_probe_d3d8_two_texture_alpha_quad','_cnc_port_probe_d3d8_texture_mip_chain_draw','_cnc_port_probe_d3d8_texture_combiner','_cnc_port_probe_d3d8_texcoord_index','_cnc_port_probe_d3d8_fvf_texcoord_sizes','_cnc_port_probe_d3d8_texture_transform','_cnc_port_probe_d3d8_stage1_texture_transform','_cnc_port_probe_d3d8_stencil_state','_cnc_port_probe_d3d8_fog_state','_cnc_port_probe_d3d8_fill_mode','_cnc_port_probe_d3d8_z_bias','_cnc_port_probe_d3d8_shade_mode','_cnc_port_probe_d3d8_clip_plane','_cnc_port_probe_d3d8_lighting_ambient','_cnc_port_probe_d3d8_directional_light','_cnc_port_probe_d3d8_multi_directional_light','_cnc_port_probe_d3d8_specular_light','_cnc_port_probe_d3d8_specular_offaxis_light','_cnc_port_probe_d3d8_specular_transformed_light','_cnc_port_probe_d3d8_normalize_normals','_cnc_port_probe_d3d8_local_viewer','_cnc_port_probe_d3d8_point_light','_cnc_port_probe_d3d8_point_quadratic_light','_cnc_port_probe_d3d8_point_range_light','_cnc_port_probe_d3d8_point_mixed_light','_cnc_port_probe_d3d8_spot_light','_cnc_port_probe_d3d8_spot_falloff','_cnc_port_probe_d3d8_material','_cnc_port_probe_d3d8_material_sources','_cnc_port_probe_d3d8_lit_material_sources','_cnc_port_probe_d3d8_lit_specular_material_source','_cnc_port_probe_d3d8_lit_emissive_color1_material_source','_cnc_port_probe_d3d8_lit_emissive_color2_material_source','_cnc_port_probe_d3d8_legacy_texture_upload','_cnc_port_probe_d3d8_legacy_texture_draw','_cnc_port_probe_d3d8_dxt_texture_draw','_cnc_port_probe_ww3d_aabox','_cnc_port_probe_ww3d_scene_camera','_cnc_port_probe_ww3d_rts_scene','_cnc_port_probe_ww3d_rts_scene_clear_line','_cnc_port_probe_ww3d_display_scene','_cnc_port_probe_ww3d_render2d_textured_quad','_cnc_port_probe_ww3d_render2d_sentence','_cnc_port_probe_ww3d_display_string','_cnc_port_probe_ww3d_display_game_text','_cnc_port_probe_ww3d_display_drawimage','_cnc_port_probe_ww3d_display_video_buffer','_cnc_port_probe_ww3d_display_drawimage_additive','_cnc_port_probe_ww3d_display_drawimage_solid','_cnc_port_probe_ww3d_display_drawimage_grayscale','_cnc_port_probe_ww3d_display_drawimage_file','_cnc_port_probe_ww3d_display_mapped_image','_cnc_port_probe_ww3d_display_mapped_image_clip','_cnc_port_probe_ww3d_display_mapped_image_unrotated','_cnc_port_probe_ww3d_display_main_menu_ruler','_cnc_port_probe_ww3d_display_fillrect','_cnc_port_probe_ww3d_window_repaint','_cnc_port_probe_ww3d_window_layout_repaint','_cnc_port_probe_ww3d_main_menu_layout_repaint','_cnc_port_probe_ww3d_main_menu_layout_image_repaint','_cnc_port_probe_ww3d_main_menu_layout_disabled_button_repaint','_cnc_port_probe_ww3d_main_menu_layout_hilite_button_repaint','_cnc_port_probe_ww3d_main_menu_layout_pushed_button_repaint','_cnc_port_probe_ww3d_main_menu_layout_single_player_repaint','_cnc_port_probe_ww3d_main_menu_layout_load_replay_repaint','_cnc_port_probe_ww3d_main_menu_layout_difficulty_repaint','_cnc_port_probe_ww3d_main_menu_layout_static_text_repaint','_cnc_port_probe_ww3d_main_menu_layout_faction_logo_repaint','_cnc_port_probe_ww3d_display_line','_cnc_port_probe_ww3d_display_line_gradient','_cnc_port_probe_ww3d_display_openrect','_cnc_port_probe_ww3d_display_rectclock','_cnc_port_probe_ww3d_display_remaining_rectclock','_cnc_port_probe_ww3d_terrain_tile','_cnc_port_probe_ww3d_terrain_tile_archive','_cnc_port_probe_ww3d_terrain_tile_archive_scene','_cnc_port_probe_ww3d_terrain_map_patch_scene','_cnc_port_probe_ww3d_terrain_shroud_scene','_cnc_port_probe_ww3d_terrain_visual_scene','_cnc_port_probe_ww3d_terrain_full_scene','_cnc_port_probe_ww3d_terrain_full_scene_shroud_update','_cnc_port_probe_ww3d_terrain_visual_load_window_scene','_cnc_port_probe_ww3d_terrain_visual_camera_pan_scene','_cnc_port_probe_ww3d_terrain_bib_buffer_lifecycle','_cnc_port_probe_ww3d_terrain_prop_buffer_render','_cnc_port_probe_ww3d_terrain_prop_buffer_scene','_cnc_port_probe_ww3d_terrain_tree_buffer_scene','_cnc_port_probe_ww3d_terrain_road_buffer_scene','_cnc_port_probe_ww3d_terrain_bridge_buffer_scene','_cnc_port_probe_ww3d_textured_mesh','_cnc_port_probe_ww3d_emissive_color2_material_source','_cnc_port_probe_ww3d_shipped_mesh','_cnc_port_probe_ww3d_shipped_multi_texture_mesh','_cnc_port_probe_ww3d_source_asset_load','_cnc_port_probe_ww3d_font_chars','_cnc_port_probe_classic_environment_mapper_apply','_cnc_port_probe_edge_mapper_apply','_cnc_port_probe_environment_mapper_apply','_cnc_port_probe_grid_environment_mapper_apply','_cnc_port_probe_grid_ws_environment_mapper_apply','_cnc_port_probe_matrixmapper_apply','_cnc_port_probe_projection_state_apply','_cnc_port_probe_screen_mapper_apply','_cnc_port_probe_ws_environment_mapper_apply','_cnc_port_probe_wwshade_cubemap_apply','_cnc_port_probe_launch_web_browser','_cnc_port_init_original_wndproc_input','_cnc_port_pump_original_wndproc_input','_cnc_port_probe_original_wndproc_input','_cnc_port_probe_original_gui_mouse_stream','_cnc_port_probe_original_cursor_visibility','_cnc_port_set_original_keyboard_frame_input_enabled','_cnc_port_reset_original_keyboard_frame_input','_cnc_port_probe_original_keyboard_frame_input','_cnc_port_set_original_mouse_frame_input_enabled','_cnc_port_reset_original_mouse_frame_input','_cnc_port_probe_original_mouse_frame_input','_cnc_port_probe_original_mouse_frame_windows','_cnc_port_resolve_original_mouse_frame_window_id','_cnc_port_probe_original_keyboard_input','_cnc_port_probe_original_keyboard_frame_tick','_cnc_port_reset_original_keyboard_input','_cnc_port_queue_original_keyboard_focus_lost','_cnc_port_probe_gdi_font','_cnc_port_state','_cnc_port_probe_audio_manager_runtime','_cnc_port_mss_adpcm_payload_buffer','_cnc_port_probe_mss_adpcm_sample_playback_start','_cnc_port_probe_object_ini','_cnc_port_probe_object_ini_snippet','_cnc_port_probe_missile_garrison_bound']"
  "SHELL:-sEXPORTED_FUNCTIONS=['_cnc_port_boot','_cnc_port_real_engine_set_resolution','_cnc_port_frame','_cnc_port_query_drawables','_cnc_port_query_selection','_cnc_port_start_main_loop','_cnc_port_stop_main_loop','_cnc_port_probe_archive','_cnc_port_register_archive_set','_cnc_port_set_browser_input','_cnc_port_set_browser_input_lite','_cnc_port_reset_browser_input','_cnc_port_post_browser_message','_cnc_port_post_browser_message_lite','_cnc_port_probe_browser_message_queue','_cnc_port_probe_browser_input','_cnc_port_build_browser_network_relay_packet','_cnc_port_accept_browser_network_relay_packet','_cnc_port_build_browser_network_transport_packet','_cnc_port_accept_browser_network_transport_packet','_cnc_port_build_browser_network_transport_wire_packet','_cnc_port_accept_browser_network_transport_wire_packet','_cnc_port_probe_browser_network_transport_live_send','_cnc_port_probe_browser_network_transport_live_receive','_cnc_port_build_browser_lanapi_announce_packet','_cnc_port_accept_browser_lanapi_announce_packet','_cnc_port_build_browser_lanapi_join_request_packet','_cnc_port_accept_browser_lanapi_join_request_packet','_cnc_port_accept_browser_lanapi_join_accept_packet','_cnc_port_probe_browser_lanapi_live_game_start_send','_cnc_port_probe_browser_lanapi_live_game_start_receive','_cnc_port_probe_win32_gameengine','_cnc_port_probe_mss_startup','_cnc_port_probe_mss_sample_lifecycle','_cnc_port_probe_mss_sample_playback_start','_cnc_port_probe_mss_sample_playback_finish','_cnc_port_probe_mss_stream_lifecycle','_cnc_port_probe_mss_3d_sample_lifecycle','_cnc_port_probe_d3d8_clear','_cnc_port_probe_d3d8_viewport','_cnc_port_probe_d3d8_buffer_dirty','_cnc_port_probe_d3d8_buffer_hints','_cnc_port_probe_d3d8_texture_upload','_cnc_port_probe_d3d8_volume_texture_upload','_cnc_port_probe_d3d8_texture_bind','_cnc_port_probe_d3d8_textured_quad','_cnc_port_probe_d3d8_two_texture_quad','_cnc_port_probe_d3d8_two_texture_alpha_quad','_cnc_port_probe_d3d8_texture_mip_chain_draw','_cnc_port_probe_d3d8_texture_combiner','_cnc_port_probe_d3d8_texcoord_index','_cnc_port_probe_d3d8_fvf_texcoord_sizes','_cnc_port_probe_d3d8_texture_transform','_cnc_port_probe_d3d8_stage1_texture_transform','_cnc_port_probe_d3d8_stencil_state','_cnc_port_probe_d3d8_fog_state','_cnc_port_probe_d3d8_fill_mode','_cnc_port_probe_d3d8_z_bias','_cnc_port_probe_d3d8_shade_mode','_cnc_port_probe_d3d8_clip_plane','_cnc_port_probe_d3d8_lighting_ambient','_cnc_port_probe_d3d8_directional_light','_cnc_port_probe_d3d8_multi_directional_light','_cnc_port_probe_d3d8_specular_light','_cnc_port_probe_d3d8_specular_offaxis_light','_cnc_port_probe_d3d8_specular_transformed_light','_cnc_port_probe_d3d8_normalize_normals','_cnc_port_probe_d3d8_local_viewer','_cnc_port_probe_d3d8_point_light','_cnc_port_probe_d3d8_point_quadratic_light','_cnc_port_probe_d3d8_point_range_light','_cnc_port_probe_d3d8_point_mixed_light','_cnc_port_probe_d3d8_spot_light','_cnc_port_probe_d3d8_spot_falloff','_cnc_port_probe_d3d8_material','_cnc_port_probe_d3d8_material_sources','_cnc_port_probe_d3d8_lit_material_sources','_cnc_port_probe_d3d8_lit_specular_material_source','_cnc_port_probe_d3d8_lit_emissive_color1_material_source','_cnc_port_probe_d3d8_lit_emissive_color2_material_source','_cnc_port_probe_d3d8_legacy_texture_upload','_cnc_port_probe_d3d8_legacy_texture_draw','_cnc_port_probe_d3d8_dxt_texture_draw','_cnc_port_probe_ww3d_aabox','_cnc_port_probe_ww3d_scene_camera','_cnc_port_probe_ww3d_rts_scene','_cnc_port_probe_ww3d_rts_scene_clear_line','_cnc_port_probe_ww3d_display_scene','_cnc_port_probe_ww3d_render2d_textured_quad','_cnc_port_probe_ww3d_render2d_sentence','_cnc_port_probe_ww3d_display_string','_cnc_port_probe_ww3d_display_game_text','_cnc_port_probe_ww3d_display_drawimage','_cnc_port_probe_ww3d_display_video_buffer','_cnc_port_probe_ww3d_display_drawimage_additive','_cnc_port_probe_ww3d_display_drawimage_solid','_cnc_port_probe_ww3d_display_drawimage_grayscale','_cnc_port_probe_ww3d_display_drawimage_file','_cnc_port_probe_ww3d_display_mapped_image','_cnc_port_probe_ww3d_display_mapped_image_clip','_cnc_port_probe_ww3d_display_mapped_image_unrotated','_cnc_port_probe_ww3d_display_main_menu_ruler','_cnc_port_probe_ww3d_display_fillrect','_cnc_port_probe_ww3d_window_repaint','_cnc_port_probe_ww3d_window_layout_repaint','_cnc_port_probe_ww3d_main_menu_layout_repaint','_cnc_port_probe_ww3d_main_menu_layout_image_repaint','_cnc_port_probe_ww3d_main_menu_layout_disabled_button_repaint','_cnc_port_probe_ww3d_main_menu_layout_hilite_button_repaint','_cnc_port_probe_ww3d_main_menu_layout_pushed_button_repaint','_cnc_port_probe_ww3d_main_menu_layout_single_player_repaint','_cnc_port_probe_ww3d_main_menu_layout_load_replay_repaint','_cnc_port_probe_ww3d_main_menu_layout_difficulty_repaint','_cnc_port_probe_ww3d_main_menu_layout_static_text_repaint','_cnc_port_probe_ww3d_main_menu_layout_faction_logo_repaint','_cnc_port_probe_ww3d_display_line','_cnc_port_probe_ww3d_display_line_gradient','_cnc_port_probe_ww3d_display_openrect','_cnc_port_probe_ww3d_display_rectclock','_cnc_port_probe_ww3d_display_remaining_rectclock','_cnc_port_probe_ww3d_terrain_tile','_cnc_port_probe_ww3d_terrain_tile_archive','_cnc_port_probe_ww3d_terrain_tile_archive_scene','_cnc_port_probe_ww3d_terrain_map_patch_scene','_cnc_port_probe_ww3d_terrain_shroud_scene','_cnc_port_probe_ww3d_terrain_visual_scene','_cnc_port_probe_ww3d_terrain_full_scene','_cnc_port_probe_ww3d_terrain_full_scene_shroud_update','_cnc_port_probe_ww3d_terrain_visual_load_window_scene','_cnc_port_probe_ww3d_terrain_visual_camera_pan_scene','_cnc_port_probe_ww3d_terrain_bib_buffer_lifecycle','_cnc_port_probe_ww3d_terrain_prop_buffer_render','_cnc_port_probe_ww3d_terrain_prop_buffer_scene','_cnc_port_probe_ww3d_terrain_tree_buffer_scene','_cnc_port_probe_ww3d_terrain_road_buffer_scene','_cnc_port_probe_ww3d_terrain_bridge_buffer_scene','_cnc_port_probe_ww3d_textured_mesh','_cnc_port_probe_ww3d_emissive_color2_material_source','_cnc_port_probe_ww3d_shipped_mesh','_cnc_port_probe_ww3d_shipped_multi_texture_mesh','_cnc_port_probe_ww3d_source_asset_load','_cnc_port_probe_ww3d_font_chars','_cnc_port_probe_classic_environment_mapper_apply','_cnc_port_probe_edge_mapper_apply','_cnc_port_probe_environment_mapper_apply','_cnc_port_probe_grid_environment_mapper_apply','_cnc_port_probe_grid_ws_environment_mapper_apply','_cnc_port_probe_matrixmapper_apply','_cnc_port_probe_projection_state_apply','_cnc_port_probe_screen_mapper_apply','_cnc_port_probe_ws_environment_mapper_apply','_cnc_port_probe_wwshade_cubemap_apply','_cnc_port_probe_launch_web_browser','_cnc_port_init_original_wndproc_input','_cnc_port_pump_original_wndproc_input','_cnc_port_probe_original_wndproc_input','_cnc_port_probe_original_gui_mouse_stream','_cnc_port_probe_original_cursor_visibility','_cnc_port_set_original_keyboard_frame_input_enabled','_cnc_port_reset_original_keyboard_frame_input','_cnc_port_probe_original_keyboard_frame_input','_cnc_port_set_original_mouse_frame_input_enabled','_cnc_port_reset_original_mouse_frame_input','_cnc_port_probe_original_mouse_frame_input','_cnc_port_probe_original_mouse_frame_windows','_cnc_port_resolve_original_mouse_frame_window_id','_cnc_port_probe_original_keyboard_input','_cnc_port_probe_original_keyboard_frame_tick','_cnc_port_reset_original_keyboard_input','_cnc_port_queue_original_keyboard_focus_lost','_cnc_port_probe_gdi_font','_cnc_port_state','_cnc_port_probe_audio_manager_runtime','_cnc_port_probe_module_factory_runtime','_cnc_port_probe_particle_system_runtime','_cnc_port_mss_adpcm_payload_buffer','_cnc_port_probe_mss_adpcm_sample_playback_start','_cnc_port_probe_object_ini','_cnc_port_probe_object_ini_snippet','_cnc_port_probe_missile_garrison_bound']"
  # addRunDependency/removeRunDependency: the JS bridge's IDBFS save mount
  # (mountSaveFilesystem in harness/bridge.js) holds main() on the initial
  # FS.syncfs pull via a run dependency. Without exporting them, ASSERTIONS
  # builds define abort-on-access stubs and the whole module fails to load
  # the moment the preRun hook even probes for the function.
  "SHELL:-sEXPORTED_RUNTIME_METHODS=['cwrap','FS','addRunDependency','removeRunDependency']"
)

if(CNC_PORT_THREADS)
  # Engine-thread P0 spike link surface (IDEAS.md "the browser as a 2003 PC").
  # -pthread itself comes from the global add_compile_options/add_link_options
  # at the top of this file.
  #
  # NOTE: -sPROXY_TO_PTHREAD is intentionally ABSENT. cnc-port links with
  # --no-entry and is driven by exported functions from the JS bridge; emsdk
  # 3.1.6 hard-errors on that combination:
  #   "emcc: error: PROXY_TO_PTHREAD proxies main() for you, but no main exists"
  # The threaded architecture instead spawns its own engine pthread — see
  # src/wasm_engine_thread_spike.cpp (cnc_port_spawn_engine_thread /
  # cnc_port_spawn_engine_init_thread).
  #
  # NOTE: -sEXPORT_ES6=1 + -sMODULARIZE=1 + pthreads verified WORKING at
  # runtime on emsdk 3.1.6 + headless Chromium (the pthread worker is a
  # classic worker that dynamic-import()s the ES module; Chromium allows
  # dynamic import in classic dedicated workers). No output-format downgrade
  # was needed.
  #
  # NOTE: memory shape — the threaded build links with a FIXED-SIZE heap
  # (ALLOW_MEMORY_GROWTH=0, INITIAL_MEMORY=2GiB == the default build's
  # MAXIMUM). See CNC_PORT_MEMORY_LINK_OPTIONS above for the full rationale
  # and the P3 measurements (this removes the 3.1.6 -Wpthreads-mem-growth
  # "may run non-wasm code slowly" JS heap-access tax).
  #
  # P1a scaffold (WebAssembly/notes/p1-engine-thread.md):
  #   - PTHREAD_POOL_SIZE=1 (down from the P0 spike's 4): the single pool
  #     worker is deterministic, so the main realm can prepare THAT worker's
  #     realm (executor import, OffscreenCanvas transfer, Module.cncPortD3D8*
  #     hooks) before the engine pthread is spawned onto it.
  #   - threads_realm_stub.pre.js: --pre-js realm stub baked into cnc-port.js;
  #     no-op on the main realm, installs the {__cncRealm:...} message
  #     protocol when Module["ENVIRONMENT_IS_PTHREAD"] (see file header).
  #   - wasm_engine_thread_boot.cpp: boot/go/heartbeat exports; proves
  #     emscripten_set_main_loop ON the pthread (rAF-driven ticks in the
  #     worker realm) presenting through the D3D8 shim's EM_JS clear path.
  target_sources(cnc-port PRIVATE
    src/wasm_engine_thread_spike.cpp
    src/wasm_engine_thread_boot.cpp
  )
  target_link_options(cnc-port PRIVATE
    "SHELL:-sOFFSCREENCANVAS_SUPPORT=1"
    "SHELL:-sPTHREAD_POOL_SIZE=1"
    "SHELL:--pre-js ${CMAKE_CURRENT_SOURCE_DIR}/src/threads_realm_stub.pre.js"
  )
  set_property(TARGET cnc-port APPEND PROPERTY LINK_DEPENDS
    "${CMAKE_CURRENT_SOURCE_DIR}/src/threads_realm_stub.pre.js"
  )
endif()

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
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(compression-manager-smoke
  tests/compression_manager_smoke.cpp
)

set_target_properties(compression-manager-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(compression-manager-smoke PRIVATE
  zh_compression_manager
)

target_compile_options(compression-manager-smoke PRIVATE
  -include "${COMPRESSION_EAC_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-language-extension-token
  -Wno-unknown-pragmas
)

target_link_options(compression-manager-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
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
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwdebug-profile-smoke
  tests/wwdebug_profile_smoke.cpp
)

set_target_properties(wwdebug-profile-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwdebug-profile-smoke PRIVATE
  zh_wwdebug_profile
)

target_compile_options(wwdebug-profile-smoke PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-duplicate-decl-specifier
  -Wno-keyword-macro
  -Wno-missing-declarations
  -Wno-unknown-pragmas
)

target_link_options(wwdebug-profile-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
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
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwlib-image-misc-smoke
  tests/wwlib_image_misc_smoke.cpp
)

set_target_properties(wwlib-image-misc-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-image-misc-smoke PRIVATE
  zh_wwlib_targa
  zh_wwlib_win_globals
)

target_compile_options(wwlib-image-misc-smoke PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-keyword-macro
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_options(wwlib-image-misc-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwlib-platform-compat-smoke
  tests/wwlib_platform_compat_smoke.cpp
)

set_target_properties(wwlib-platform-compat-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-platform-compat-smoke PRIVATE
  zh_wwlib_platform_compat
)

target_compile_definitions(wwlib-platform-compat-smoke PRIVATE
  _UNIX
)

target_compile_options(wwlib-platform-compat-smoke PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-keyword-macro
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_options(wwlib-platform-compat-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwlib-surface-core-smoke
  tests/wwlib_surface_core_smoke.cpp
)

set_target_properties(wwlib-surface-core-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-surface-core-smoke PRIVATE
  zh_wwlib_surface_core
)

target_compile_options(wwlib-surface-core-smoke PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-keyword-macro
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_options(wwlib-surface-core-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwlib-convert-globals-smoke
  tests/wwlib_convert_globals_smoke.cpp
)

set_target_properties(wwlib-convert-globals-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-convert-globals-smoke PRIVATE
  zh_wwlib_convert_globals
)

target_compile_options(wwlib-convert-globals-smoke PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-keyword-macro
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_options(wwlib-convert-globals-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwlib-font-smoke
  tests/wwlib_font_smoke.cpp
)

set_target_properties(wwlib-font-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-font-smoke PRIVATE
  zh_wwlib_font
)

target_compile_options(wwlib-font-smoke PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-keyword-macro
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_options(wwlib-font-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwlib-launchweb-smoke
  tests/wwlib_launchweb_smoke.cpp
)

set_target_properties(wwlib-launchweb-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-launchweb-smoke PRIVATE
  zh_wwlib_launchweb
)

target_compile_options(wwlib-launchweb-smoke PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-keyword-macro
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_options(wwlib-launchweb-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
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
  ${CNC_ASSERTIONS_LINK_OPTION}
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
  ${CNC_ASSERTIONS_LINK_OPTION}
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
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwlib-buffer-ownership-smoke
  tests/wwlib_buffer_ownership_smoke.cpp
)

set_target_properties(wwlib-buffer-ownership-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-buffer-ownership-smoke PRIVATE
  zh_wwlib_file_core
)

target_compile_options(wwlib-buffer-ownership-smoke PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -Wall
  -Wextra
  -Wpedantic
  -Wno-unknown-pragmas
)

target_link_options(wwlib-buffer-ownership-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
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
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwlib-utility-core-smoke
  tests/wwlib_utility_core_smoke.cpp
)

set_target_properties(wwlib-utility-core-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-utility-core-smoke PRIVATE
  zh_wwlib_utility_core
  zh_wwlib_systimer
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
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwlib-stream-core-smoke
  tests/wwlib_stream_core_smoke.cpp
)

set_target_properties(wwlib-stream-core-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-stream-core-smoke PRIVATE
  zh_wwlib_stream_core
)

target_compile_options(wwlib-stream-core-smoke PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-keyword-macro
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_options(wwlib-stream-core-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwlib-lzo-smoke
  tests/wwlib_lzo_smoke.cpp
)

set_target_properties(wwlib-lzo-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-lzo-smoke PRIVATE
  zh_wwlib_lzo
)

target_compile_options(wwlib-lzo-smoke PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-keyword-macro
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_options(wwlib-lzo-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwlib-public-key-smoke
  tests/wwlib_public_key_smoke.cpp
)

set_target_properties(wwlib-public-key-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-public-key-smoke PRIVATE
  zh_wwlib_public_key
)

target_compile_options(wwlib-public-key-smoke PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-keyword-macro
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_options(wwlib-public-key-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwlib-file-ini-smoke
  tests/wwlib_file_ini_smoke.cpp
)

set_target_properties(wwlib-file-ini-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-file-ini-smoke PRIVATE
  zh_wwlib_file_ini
)

target_compile_definitions(wwlib-file-ini-smoke PRIVATE
  _UNIX
)

target_compile_options(wwlib-file-ini-smoke PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-keyword-macro
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_options(wwlib-file-ini-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwlib-mixfile-smoke
  tests/wwlib_mixfile_smoke.cpp
)

set_target_properties(wwlib-mixfile-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-mixfile-smoke PRIVATE
  zh_wwlib_mixfile
)

target_compile_definitions(wwlib-mixfile-smoke PRIVATE
  _UNIX
)

target_compile_options(wwlib-mixfile-smoke PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-keyword-macro
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_options(wwlib-mixfile-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwlib-mutex-smoke
  tests/wwlib_mutex_smoke.cpp
)

set_target_properties(wwlib-mutex-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-mutex-smoke PRIVATE
  zh_wwlib_mutex
)

target_compile_options(wwlib-mutex-smoke PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-keyword-macro
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_options(wwlib-mutex-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwlib-regex-smoke
  tests/wwlib_regex_smoke.cpp
)

set_target_properties(wwlib-regex-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-regex-smoke PRIVATE
  zh_wwlib_regex
)

target_compile_options(wwlib-regex-smoke PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-keyword-macro
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_options(wwlib-regex-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwlib-thread-smoke
  tests/wwlib_thread_smoke.cpp
)

set_target_properties(wwlib-thread-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-thread-smoke PRIVATE
  zh_wwlib_thread
)

target_compile_definitions(wwlib-thread-smoke PRIVATE
  _UNIX
)

target_compile_options(wwlib-thread-smoke PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-keyword-macro
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_options(wwlib-thread-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwlib-mpu-smoke
  tests/wwlib_mpu_smoke.cpp
)

set_target_properties(wwlib-mpu-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-mpu-smoke PRIVATE
  zh_wwlib_mpu
)

target_compile_options(wwlib-mpu-smoke PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-keyword-macro
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_options(wwlib-mpu-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwlib-cpudetect-smoke
  tests/wwlib_cpudetect_smoke.cpp
)

set_target_properties(wwlib-cpudetect-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-cpudetect-smoke PRIVATE
  zh_wwlib_cpudetect
)

target_compile_options(wwlib-cpudetect-smoke PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-keyword-macro
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_options(wwlib-cpudetect-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
)

add_executable(wwlib-legacy-platform-smoke
  tests/wwlib_legacy_platform_smoke.cpp
)

set_target_properties(wwlib-legacy-platform-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-legacy-platform-smoke PRIVATE
  zh_wwlib_keyboard
  zh_wwlib_mono
  zh_wwlib_msgloop
)

target_compile_options(wwlib-legacy-platform-smoke PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-keyword-macro
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_options(wwlib-legacy-platform-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwlib-containers-smoke
  tests/wwlib_containers_smoke.cpp
)

set_target_properties(wwlib-containers-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-containers-smoke PRIVATE
  zh_wwlib_containers
)

target_compile_options(wwlib-containers-smoke PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-extra-tokens
  -Wno-keyword-macro
  -Wno-reorder-ctor
  -Wno-unknown-pragmas
  -Wno-undefined-var-template
  -Wno-unused-but-set-variable
  -Wno-unused-parameter
)

target_link_options(wwlib-containers-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
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
  ${CNC_ASSERTIONS_LINK_OPTION}
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
  ${CNC_ASSERTIONS_LINK_OPTION}
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
  ${CNC_ASSERTIONS_LINK_OPTION}
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
  ${CNC_ASSERTIONS_LINK_OPTION}
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
  -fsanitize=undefined
  -fno-sanitize-recover=undefined
  -fms-extensions
  -Wall
  -Wextra
  "-Wno-#pragma-messages"
  -Wno-deprecated-copy-with-user-provided-copy
  -Wno-logical-not-parentheses
  -Wno-logical-op-parentheses
  -Wno-microsoft-extra-qualification
  -Wno-overloaded-virtual
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-unused-value
)

target_link_options(wwmath-core-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  -fsanitize=undefined
  -fno-sanitize-recover=undefined
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwmath-curves-smoke
  tests/wwmath_curves_smoke.cpp
)

set_target_properties(wwmath-curves-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwmath-curves-smoke PRIVATE
  zh_wwmath_curves
)

target_compile_options(wwmath-curves-smoke PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  "-Wno-#pragma-messages"
  -Wno-extra-tokens
  -Wno-keyword-macro
  -Wno-logical-not-parentheses
  -Wno-overloaded-virtual
  -Wno-unknown-pragmas
  -Wno-undefined-var-template
  -Wno-unused-but-set-variable
  -Wno-unused-parameter
)

target_link_options(wwmath-curves-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwmath-lookup-smoke
  tests/wwmath_lookup_smoke.cpp
)

set_target_properties(wwmath-lookup-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwmath-lookup-smoke PRIVATE
  zh_wwmath_lookup
)

target_compile_options(wwmath-lookup-smoke PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  "-Wno-#pragma-messages"
  -Wno-extra-tokens
  -Wno-keyword-macro
  -Wno-logical-not-parentheses
  -Wno-overloaded-virtual
  -Wno-unknown-pragmas
  -Wno-undefined-var-template
  -Wno-unused-but-set-variable
  -Wno-unused-parameter
)

target_link_options(wwmath-lookup-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwsaveload-full-smoke
  tests/wwsaveload_full_smoke.cpp
)

set_target_properties(wwsaveload-full-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwsaveload-full-smoke PRIVATE
  zh_wwsaveload_full
)

target_compile_options(wwsaveload-full-smoke PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-deprecated-copy-with-user-provided-copy
  -Wno-extra-semi
  -Wno-extra-tokens
  -Wno-keyword-macro
  -Wno-logical-not-parentheses
  -Wno-logical-op-parentheses
  -Wno-overloaded-virtual
  -Wno-reorder-ctor
  -Wno-unknown-pragmas
  -Wno-undefined-var-template
  -Wno-unused-but-set-variable
  -Wno-unused-parameter
)

target_link_options(wwsaveload-full-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwutil-smoke
  tests/wwutil_smoke.cpp
)

set_target_properties(wwutil-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwutil-smoke PRIVATE
  zh_wwutil
)

target_compile_options(wwutil-smoke PRIVATE
  -include "${WWVEGAS_MUTEX_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-extra-tokens
  -Wno-keyword-macro
  -Wno-logical-not-parentheses
  -Wno-unknown-pragmas
  -Wno-undefined-var-template
  -Wno-unused-parameter
)

target_link_options(wwutil-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(wwdownload-smoke
  tests/wwdownload_smoke.cpp
)

set_target_properties(wwdownload-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwdownload-smoke PRIVATE
  zh_wwdownload
)

target_compile_options(wwdownload-smoke PRIVATE
  -include "${WWVEGAS_PORT_SHIM}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-extra-tokens
  -Wno-keyword-macro
  -Wno-unknown-pragmas
  -Wno-unused-parameter
)

target_link_options(wwdownload-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
)

add_executable(gameengine-header-case-smoke
  tests/gameengine_header_case_smoke.cpp
)

set_target_properties(gameengine-header-case-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_include_directories(gameengine-header-case-smoke PRIVATE
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${WWSAVELOAD_DIR}"
)

target_compile_definitions(gameengine-header-case-smoke PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(gameengine-header-case-smoke PRIVATE
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-extra-tokens
  -Wno-logical-not-parentheses
  -Wno-register
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

target_link_options(gameengine-header-case-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sEXIT_RUNTIME=1"
)

add_library(zh_gameclient_utility_smoke_ini_support STATIC
  src/wasm_gameclient_utility_smoke_ini_support.cpp
)

target_include_directories(zh_gameclient_utility_smoke_ini_support PUBLIC
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${WWSAVELOAD_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_definitions(zh_gameclient_utility_smoke_ini_support PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(zh_gameclient_utility_smoke_ini_support PRIVATE
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-writable-strings
)

add_executable(gameclient-utility-smoke
  tests/gameclient_utility_smoke.cpp
)

set_target_properties(gameclient-utility-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(gameclient-utility-smoke PRIVATE
  zh_gameclient_utility
  zh_gameclient_utility_smoke_ini_support
  zh_gameengine_globaldata_runtime
  zh_gameengine_debug_runtime
)

target_compile_definitions(gameclient-utility-smoke PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_include_directories(gameclient-utility-smoke PRIVATE
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${WWSAVELOAD_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

set_source_files_properties(src/wasm_gameclient_utility_smoke_ini_support.cpp PROPERTIES
  COMPILE_OPTIONS "-iquote${GAMEENGINE_INCLUDE_DIR};-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled;-iquote${GAMEENGINE_DIR}/Source;-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR};-iquote${MAIN_DIR};-iquote${ZH_LIB_INCLUDE_DIR};-iquote${ZH_CODE_DIR}/Libraries/Source;-iquote${WWVEGAS_DIR};-iquote${WWVEGAS_DIR}/WW3D2;-iquote${WWDEBUG_DIR};-iquote${WWLIB_DIR};-iquote${WWMATH_DIR};-iquote${WWSAVELOAD_DIR};-iquote${COMPRESSION_DIR};-iquote${COMPRESSION_EAC_DIR}"
)

target_compile_options(gameclient-utility-smoke PRIVATE
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(gameclient-utility-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
)

add_executable(win32-mouse-smoke
  tests/win32_mouse_smoke.cpp
  src/wasm_gameclient_utility_smoke_ini_support.cpp
)

set_target_properties(win32-mouse-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(win32-mouse-smoke PRIVATE
  zh_win32_mouse_browser_real
  zh_gameengine_globaldata_runtime
  zh_gameengine_debug_runtime
)

target_compile_definitions(win32-mouse-smoke PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(win32-mouse-smoke PRIVATE
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(win32-mouse-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
)

add_executable(win32-mouse-cursor-smoke
  tests/win32_mouse_cursor_smoke.cpp
  src/wasm_gameclient_utility_smoke_ini_support.cpp
)

set_target_properties(win32-mouse-cursor-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(win32-mouse-cursor-smoke PRIVATE
  zh_win32_mouse_browser_real
  zh_gameengine_globaldata_runtime
  zh_gameengine_debug_runtime
)

target_compile_definitions(win32-mouse-cursor-smoke PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(win32-mouse-cursor-smoke PRIVATE
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(win32-mouse-cursor-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
)

add_executable(win32-keyboard-smoke
  tests/win32_keyboard_smoke.cpp
  src/wasm_gameclient_utility_smoke_ini_support.cpp
)

set_target_properties(win32-keyboard-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(win32-keyboard-smoke PRIVATE
  zh_gameclient_utility
  zh_gameengine_globaldata_runtime
  zh_gameengine_debug_runtime
)

target_compile_definitions(win32-keyboard-smoke PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(win32-keyboard-smoke PRIVATE
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(win32-keyboard-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
)

add_executable(win32-keyboard-focus-repeat-smoke
  tests/win32_keyboard_focus_repeat_smoke.cpp
  src/wasm_gameclient_utility_smoke_ini_support.cpp
)

set_target_properties(win32-keyboard-focus-repeat-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(win32-keyboard-focus-repeat-smoke PRIVATE
  zh_gameclient_utility
  zh_gameengine_globaldata_runtime
  zh_gameengine_debug_runtime
)

target_compile_definitions(win32-keyboard-focus-repeat-smoke PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(win32-keyboard-focus-repeat-smoke PRIVATE
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(win32-keyboard-focus-repeat-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
)

add_executable(gamewindow-input-smoke
  tests/gamewindow_input_smoke.cpp
  src/wasm_gameclient_utility_smoke_ini_support.cpp
)

set_target_properties(gamewindow-input-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(gamewindow-input-smoke PRIVATE
  zh_win32_mouse_browser_real
  zh_gameengine_globaldata_runtime
  zh_gameengine_debug_runtime
)

target_compile_definitions(gamewindow-input-smoke PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(gamewindow-input-smoke PRIVATE
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(gamewindow-input-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
)

add_executable(w3d-gamewindow-manager-smoke
  tests/w3d_gamewindow_manager_smoke.cpp
  src/wasm_w3d_gamewindow_manager_smoke_support.cpp
  src/wasm_win32_gdi_stub.cpp
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/W3DGameWindow.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/W3DGameWindowManager.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DCheckBox.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DComboBox.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DHorizontalSlider.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DListBox.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DProgressBar.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DPushButton.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DRadioButton.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DStaticText.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DTabControl.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DTextEntry.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/Gadget/W3DVerticalSlider.cpp"
)

set_target_properties(w3d-gamewindow-manager-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_compile_definitions(w3d-gamewindow-manager-smoke PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_link_libraries(w3d-gamewindow-manager-smoke PRIVATE
  zh_gameclient_gui_input_runtime
  zh_ww3d2_compile_frontier
  zh_browser_d3d8
  zh_wwmath_lookup
  zh_wwmath_core
  zh_wwsaveload_full
  zh_wwsaveload_core
  zh_wwlib_file_ini
  zh_wwlib_file_core
  zh_wwlib_stream_core
  zh_wwlib_string
  zh_wwlib_refcount
  zh_wwlib_containers
  zh_wwlib_crc
  zh_wwlib_random
  zh_wwlib_thread
  zh_wwlib_mutex
  zh_wwlib_targa
  zh_wwdebug_profile
  zh_wwdebug_core
  zh_compression_manager
  zh_compression_eac
)

target_include_directories(w3d-gamewindow-manager-smoke PRIVATE
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${WWSAVELOAD_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_options(w3d-gamewindow-manager-smoke PRIVATE
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -ffunction-sections
  -fdata-sections
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-logical-not-parentheses
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

target_link_options(w3d-gamewindow-manager-smoke PRIVATE
  "SHELL:-Wl,--gc-sections"
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
)

add_executable(w3d-window-layout-script-smoke
  tests/w3d_window_layout_script_smoke.cpp
  src/wasm_gameclient_utility_smoke_ini_support.cpp
  src/wasm_terrain_probe_game_logic.cpp
  "${GAMEENGINE_COMMON_DIR}/System/FunctionLexicon.cpp"
  "${GAMEENGINE_COMMON_DIR}/SkirmishBattleHonors.cpp"
  "${GAMEENGINE_COMMON_DIR}/UserPreferences.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Display.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/DisplayString.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/DisplayStringManager.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/AnimateWindowManager.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Credits.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/MessageBox.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/CreditsMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/MainMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/SkirmishGameOptionsMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GameFont.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GameWindowManagerScript.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/HeaderTemplate.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Input/Mouse.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ProcessAnimateWindow.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Shell/Shell.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Shell/ShellMenuScheme.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameInfo.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GUIUtil.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/Common/System/W3DFunctionLexicon.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/W3DDevice/GameClient/GUI/GUICallbacks/W3DMainMenu.cpp"
)

set_target_properties(w3d-window-layout-script-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(w3d-window-layout-script-smoke PRIVATE
  zh_gameclient_gui_input_runtime
  zh_gameengine_globaldata_runtime
  zh_gameengine_debug_runtime
)

target_include_directories(w3d-window-layout-script-smoke PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}/src"
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${WWSAVELOAD_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_definitions(w3d-window-layout-script-smoke PRIVATE
  CNC_PORT_GAMELOGIC_SUPPORT_NO_OBJECT_RUNTIME=1
  CNC_PORT_GAMELOGIC_SUPPORT_REAL_PRERTS=1
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(w3d-window-layout-script-smoke PRIVATE
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -ffunction-sections
  -fdata-sections
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-logical-not-parentheses
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

target_link_options(w3d-window-layout-script-smoke PRIVATE
  "SHELL:-Wl,--gc-sections"
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sNODERAWFS=1"
)

add_executable(gamelogic-new-game-dispatch-smoke
  tests/gamelogic_new_game_dispatch_smoke.cpp
  "${GAMEENGINE_COMMON_DIR}/GlobalData.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIAiData.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIGameData.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INI.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIMultiplayer.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIWebpageURL.cpp"
  "${GAMEENGINE_COMMON_DIR}/MultiplayerSettings.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/FunctionLexicon.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/AcademyStats.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Energy.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Money.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Player.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/PlayerList.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/PlayerTemplate.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/ResourceGatheringManager.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/ScoreKeeper.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Science.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Team.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/TunnelTracker.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/Radar.cpp"
  "${GAMEENGINE_COMMON_DIR}/System/SaveGame/GameState.cpp"
  "${GAMEENGINE_COMMON_DIR}/TerrainTypes.cpp"
  "${GAMEENGINE_COMMON_DIR}/UserPreferences.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Display.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/System/CampaignManager.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Terrain/TerrainRoads.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/AnimateWindowManager.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GameWindowManagerScript.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/HeaderTemplate.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ProcessAnimateWindow.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Shell/Shell.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Shell/ShellMenuScheme.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Map/SidesList.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AI.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AIPathfind.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/AIPlayer.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/GhostObject.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/Object/Weapon.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/ScriptEngine/ScriptActions.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/ScriptEngine/Scripts.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/ScriptEngine/ScriptEngine.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/AI/Squad.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/System/RankInfo.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/System/GameLogic.cpp"
  "${GAMEENGINE_GAMELOGIC_DIR}/System/GameLogicDispatch.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameSpy/Chat.cpp"
  "${WWSAVELOAD_DIR}/persistfactory.cpp"
  "${WWSAVELOAD_DIR}/pointerremap.cpp"
  "${WWSAVELOAD_DIR}/saveload.cpp"
)

set_target_properties(gamelogic-new-game-dispatch-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_compile_definitions(gamelogic-new-game-dispatch-smoke PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_link_libraries(gamelogic-new-game-dispatch-smoke PRIVATE
  zh_gameclient_gui_input_runtime
  zh_w3d_terrain_probe_runtime
  zh_ww3d2_compile_frontier
  zh_browser_d3d8
  zh_wwmath_lookup
  zh_wwsaveload_full
  zh_wwsaveload_core
  zh_wwlib_thread
  zh_wwlib_mutex
  zh_wwlib_targa
  zh_wwdebug_profile
)

target_include_directories(gamelogic-new-game-dispatch-smoke PRIVATE
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
  "${WWSAVELOAD_DIR}"
  "${COMPRESSION_DIR}"
  "${COMPRESSION_EAC_DIR}"
)

target_compile_options(gamelogic-new-game-dispatch-smoke PRIVATE
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -ffunction-sections
  -fdata-sections
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-invalid-offsetof
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

target_link_options(gamelogic-new-game-dispatch-smoke PRIVATE
  "SHELL:-Wl,--gc-sections"
  "SHELL:-Wl,--unresolved-symbols=ignore-all"
  "SHELL:-sERROR_ON_UNDEFINED_SYMBOLS=0"
  "SHELL:-sWARN_ON_UNDEFINED_SYMBOLS=0"
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sNODERAWFS=1"
)

add_executable(win32-gameengine-message-pump-smoke
  tests/win32_gameengine_message_pump_smoke.cpp
)

set_target_properties(win32-gameengine-message-pump-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(win32-gameengine-message-pump-smoke PRIVATE
  zh_win32_gameengine_message_pump
)

target_compile_definitions(win32-gameengine-message-pump-smoke PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(win32-gameengine-message-pump-smoke PRIVATE
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${WIN32_GAMEENGINE_SHIMS_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(win32-gameengine-message-pump-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
)

add_executable(win32-gameengine-lifetime-smoke
  tests/win32_gameengine_lifetime_smoke.cpp
)

set_target_properties(win32-gameengine-lifetime-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(win32-gameengine-lifetime-smoke PRIVATE
  zh_win32_gameengine_message_pump
  zh_gameengine_common_core
)

target_compile_definitions(win32-gameengine-lifetime-smoke PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(win32-gameengine-lifetime-smoke PRIVATE
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${WIN32_GAMEENGINE_SHIMS_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(win32-gameengine-lifetime-smoke PRIVATE
  "SHELL:-Wl,--gc-sections"
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
)

add_executable(win32-gameengine-original-lifetime-smoke
  tests/win32_gameengine_original_lifetime_smoke.cpp
)

set_target_properties(win32-gameengine-original-lifetime-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(win32-gameengine-original-lifetime-smoke PRIVATE
  zh_win32_gameengine_message_pump
  zh_gameengine_original_lifetime
  zh_gameengine_original_drawable_lifetime
)

target_compile_definitions(win32-gameengine-original-lifetime-smoke PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(win32-gameengine-original-lifetime-smoke PRIVATE
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${WIN32_GAMEENGINE_SHIMS_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -ffunction-sections
  -fdata-sections
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(win32-gameengine-original-lifetime-smoke PRIVATE
  "SHELL:-Wl,--gc-sections"
  "SHELL:-sERROR_ON_UNDEFINED_SYMBOLS=0"
  "SHELL:-sWARN_ON_UNDEFINED_SYMBOLS=0"
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
)

add_executable(winmain-wndproc-mouse-smoke
  tests/winmain_wndproc_mouse_smoke.cpp
  src/wasm_gameclient_utility_smoke_ini_support.cpp
)

set_target_properties(winmain-wndproc-mouse-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(winmain-wndproc-mouse-smoke PRIVATE
  zh_winmain_wndproc_browser
  zh_win32_gameengine_message_pump
  zh_gameengine_globaldata_runtime
  zh_gameengine_debug_runtime
)

target_compile_definitions(winmain-wndproc-mouse-smoke PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(winmain-wndproc-mouse-smoke PRIVATE
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${WINMAIN_WNDPROC_SHIMS_DIR}"
  "-iquote${WIN32_GAMEENGINE_SHIMS_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(winmain-wndproc-mouse-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
)

add_executable(w3d-device-utility-smoke
  tests/w3d_device_utility_smoke.cpp
)

set_target_properties(w3d-device-utility-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(w3d-device-utility-smoke PRIVATE
  zh_w3d_device_utility
  zh_gameengine_globaldata_runtime
  zh_gameengine_debug_runtime
)

target_compile_definitions(w3d-device-utility-smoke PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(w3d-device-utility-smoke PRIVATE
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(w3d-device-utility-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sEXIT_RUNTIME=1"
)

add_executable(ww3d2-light-render-smoke
  tests/ww3d2_light_render_smoke.cpp
)

set_target_properties(ww3d2-light-render-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(ww3d2-light-render-smoke PRIVATE
  zh_ww3d2_compile_frontier
  zh_gameengine_common_core
  zh_wwmath_lookup
  zh_wwmath_core
  zh_wwsaveload_full
  zh_wwsaveload_core
  zh_wwlib_file_ini
  zh_wwlib_file_core
  zh_wwlib_stream_core
  zh_wwlib_string
  zh_wwlib_refcount
  zh_wwlib_containers
  zh_wwlib_crc
  zh_wwlib_random
  zh_wwdebug_core
  zh_compression_manager
  zh_compression_eac
)

target_compile_options(ww3d2-light-render-smoke PRIVATE
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(ww3d2-light-render-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sEXIT_RUNTIME=1"
)

add_executable(d3d8-shim-smoke
  tests/d3d8_shim_smoke.cpp
)

set_target_properties(d3d8-shim-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(d3d8-shim-smoke PRIVATE
  zh_browser_d3d8
)

target_compile_options(d3d8-shim-smoke PRIVATE
  -Wall
  -Wextra
  -Wpedantic
)

target_link_options(d3d8-shim-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sEXIT_RUNTIME=1"
)

add_executable(water-projection-state-smoke
  tests/water_projection_state_smoke.cpp
)

set_target_properties(water-projection-state-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(water-projection-state-smoke PRIVATE
  zh_browser_d3d8
)

target_compile_options(water-projection-state-smoke PRIVATE
  -Wall
  -Wextra
  -Wpedantic
)

target_link_options(water-projection-state-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sEXIT_RUNTIME=1"
)

add_executable(d3d8-render-state-mapping-smoke
  tests/d3d8_render_state_mapping_smoke.cpp
)

set_target_properties(d3d8-render-state-mapping-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(d3d8-render-state-mapping-smoke PRIVATE
  zh_browser_d3d8
)

target_compile_options(d3d8-render-state-mapping-smoke PRIVATE
  -Wall
  -Wextra
  -Wpedantic
)

target_link_options(d3d8-render-state-mapping-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sEXIT_RUNTIME=1"
)

add_executable(d3d8-texture-upload-readiness-smoke
  tests/d3d8_texture_upload_readiness_smoke.cpp
)

set_target_properties(d3d8-texture-upload-readiness-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(d3d8-texture-upload-readiness-smoke PRIVATE
  zh_browser_d3d8
)

target_compile_options(d3d8-texture-upload-readiness-smoke PRIVATE
  -Wall
  -Wextra
  -Wpedantic
)

target_link_options(d3d8-texture-upload-readiness-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sEXIT_RUNTIME=1"
)

add_executable(d3d8-texture-stage-state-mapping-smoke
  tests/d3d8_texture_stage_state_mapping_smoke.cpp
)

set_target_properties(d3d8-texture-stage-state-mapping-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(d3d8-texture-stage-state-mapping-smoke PRIVATE
  zh_browser_d3d8
)

target_compile_options(d3d8-texture-stage-state-mapping-smoke PRIVATE
  -Wall
  -Wextra
  -Wpedantic
)

target_link_options(d3d8-texture-stage-state-mapping-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sEXIT_RUNTIME=1"
)

add_executable(d3d8-texture-lifetime-smoke
  tests/d3d8_texture_lifetime_smoke.cpp
)

set_target_properties(d3d8-texture-lifetime-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(d3d8-texture-lifetime-smoke PRIVATE
  zh_browser_d3d8
)

target_compile_options(d3d8-texture-lifetime-smoke PRIVATE
  -Wall
  -Wextra
  -Wpedantic
)

target_link_options(d3d8-texture-lifetime-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sEXIT_RUNTIME=1"
)

add_executable(ww3d2-dx8wrapper-loader-smoke
  tests/ww3d2_dx8wrapper_loader_smoke.cpp
)

set_target_properties(ww3d2-dx8wrapper-loader-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(ww3d2-dx8wrapper-loader-smoke PRIVATE
  zh_ww3d2_compile_frontier
  zh_browser_d3d8
  zh_gameengine_common_core
  zh_wwmath_lookup
  zh_wwmath_core
  zh_wwsaveload_full
  zh_wwsaveload_core
  zh_wwlib_file_ini
  zh_wwlib_file_core
  zh_wwlib_stream_core
  zh_wwlib_string
  zh_wwlib_refcount
  zh_wwlib_containers
  zh_wwlib_crc
  zh_wwlib_random
  zh_wwlib_thread
  zh_wwlib_mutex
  zh_wwlib_targa
  zh_wwdebug_core
  zh_compression_manager
  zh_compression_eac
)

target_compile_options(ww3d2-dx8wrapper-loader-smoke PRIVATE
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(ww3d2-dx8wrapper-loader-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sEXIT_RUNTIME=1"
)

add_executable(ww3d2-dx8wrapper-render-smoke
  tests/ww3d2_dx8wrapper_render_smoke.cpp
)

set_target_properties(ww3d2-dx8wrapper-render-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(ww3d2-dx8wrapper-render-smoke PRIVATE
  zh_ww3d2_compile_frontier
  zh_browser_d3d8
  zh_gameengine_common_core
  zh_wwmath_lookup
  zh_wwmath_core
  zh_wwsaveload_full
  zh_wwsaveload_core
  zh_wwlib_file_ini
  zh_wwlib_file_core
  zh_wwlib_stream_core
  zh_wwlib_string
  zh_wwlib_refcount
  zh_wwlib_containers
  zh_wwlib_crc
  zh_wwlib_random
  zh_wwlib_thread
  zh_wwlib_mutex
  zh_wwlib_targa
  zh_wwdebug_profile
  zh_wwdebug_core
  zh_compression_manager
  zh_compression_eac
)

target_compile_options(ww3d2-dx8wrapper-render-smoke PRIVATE
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(ww3d2-dx8wrapper-render-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sEXIT_RUNTIME=1"
)

add_executable(ww3d2-texture-loader-smoke
  tests/ww3d2_texture_loader_smoke.cpp
  src/wasm_win32_gdi_stub.cpp
)

set_target_properties(ww3d2-texture-loader-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(ww3d2-texture-loader-smoke PRIVATE
  zh_ww3d2_compile_frontier
  zh_browser_d3d8
  zh_gameengine_common_core
  zh_wwmath_lookup
  zh_wwmath_core
  zh_wwsaveload_full
  zh_wwsaveload_core
  zh_wwlib_file_ini
  zh_wwlib_file_core
  zh_wwlib_stream_core
  zh_wwlib_string
  zh_wwlib_refcount
  zh_wwlib_containers
  zh_wwlib_crc
  zh_wwlib_random
  zh_wwlib_thread
  zh_wwlib_mutex
  zh_wwlib_targa
  zh_wwdebug_profile
  zh_wwdebug_core
  zh_compression_manager
  zh_compression_eac
)

target_compile_options(ww3d2-texture-loader-smoke PRIVATE
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(ww3d2-texture-loader-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sEXIT_RUNTIME=1"
)

add_executable(wwshade-cubemap-apply-smoke
  tests/wwshade_cubemap_apply_smoke.cpp
  src/wasm_win32_gdi_stub.cpp
)

set_target_properties(wwshade-cubemap-apply-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwshade-cubemap-apply-smoke PRIVATE
  zh_wwshade_compile_frontier
  zh_ww3d2_compile_frontier
  zh_browser_d3d8
  zh_gameengine_common_core
  zh_wwmath_lookup
  zh_wwmath_core
  zh_wwsaveload_full
  zh_wwsaveload_core
  zh_wwlib_file_ini
  zh_wwlib_file_core
  zh_wwlib_stream_core
  zh_wwlib_string
  zh_wwlib_refcount
  zh_wwlib_containers
  zh_wwlib_crc
  zh_wwlib_random
  zh_wwlib_thread
  zh_wwlib_mutex
  zh_wwlib_targa
  zh_wwdebug_core
  zh_compression_manager
  zh_compression_eac
)

target_compile_options(wwshade-cubemap-apply-smoke PRIVATE
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(wwshade-cubemap-apply-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sEXIT_RUNTIME=1"
)

add_executable(matrixmapper-apply-smoke
  tests/matrixmapper_apply_smoke.cpp
)

set_target_properties(matrixmapper-apply-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(matrixmapper-apply-smoke PRIVATE
  zh_ww3d2_compile_frontier
  zh_browser_d3d8
  zh_gameengine_common_core
  zh_wwmath_lookup
  zh_wwmath_core
  zh_wwsaveload_full
  zh_wwsaveload_core
  zh_wwlib_file_ini
  zh_wwlib_file_core
  zh_wwlib_stream_core
  zh_wwlib_string
  zh_wwlib_refcount
  zh_wwlib_containers
  zh_wwlib_crc
  zh_wwlib_random
  zh_wwlib_thread
  zh_wwlib_mutex
  zh_wwlib_targa
  zh_wwdebug_core
  zh_compression_manager
  zh_compression_eac
)

target_compile_options(matrixmapper-apply-smoke PRIVATE
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(matrixmapper-apply-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sEXIT_RUNTIME=1"
)

add_executable(classic-environment-mapper-apply-smoke
  tests/classic_environment_mapper_apply_smoke.cpp
)

set_target_properties(classic-environment-mapper-apply-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(classic-environment-mapper-apply-smoke PRIVATE
  zh_ww3d2_compile_frontier
  zh_browser_d3d8
  zh_gameengine_common_core
  zh_wwmath_lookup
  zh_wwmath_core
  zh_wwsaveload_full
  zh_wwsaveload_core
  zh_wwlib_file_ini
  zh_wwlib_file_core
  zh_wwlib_stream_core
  zh_wwlib_string
  zh_wwlib_refcount
  zh_wwlib_containers
  zh_wwlib_crc
  zh_wwlib_random
  zh_wwlib_thread
  zh_wwlib_mutex
  zh_wwlib_targa
  zh_wwdebug_core
  zh_compression_manager
  zh_compression_eac
)

target_compile_options(classic-environment-mapper-apply-smoke PRIVATE
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(classic-environment-mapper-apply-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sEXIT_RUNTIME=1"
)

add_executable(environment-mapper-apply-smoke
  tests/environment_mapper_apply_smoke.cpp
)

set_target_properties(environment-mapper-apply-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(environment-mapper-apply-smoke PRIVATE
  zh_ww3d2_compile_frontier
  zh_browser_d3d8
  zh_gameengine_common_core
  zh_wwmath_lookup
  zh_wwmath_core
  zh_wwsaveload_full
  zh_wwsaveload_core
  zh_wwlib_file_ini
  zh_wwlib_file_core
  zh_wwlib_stream_core
  zh_wwlib_string
  zh_wwlib_refcount
  zh_wwlib_containers
  zh_wwlib_crc
  zh_wwlib_random
  zh_wwlib_thread
  zh_wwlib_mutex
  zh_wwlib_targa
  zh_wwdebug_core
  zh_compression_manager
  zh_compression_eac
)

target_compile_options(environment-mapper-apply-smoke PRIVATE
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(environment-mapper-apply-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sEXIT_RUNTIME=1"
)

add_executable(screen-mapper-apply-smoke
  tests/screen_mapper_apply_smoke.cpp
)

set_target_properties(screen-mapper-apply-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(screen-mapper-apply-smoke PRIVATE
  zh_ww3d2_compile_frontier
  zh_browser_d3d8
  zh_gameengine_common_core
  zh_wwmath_lookup
  zh_wwmath_core
  zh_wwsaveload_full
  zh_wwsaveload_core
  zh_wwlib_file_ini
  zh_wwlib_file_core
  zh_wwlib_stream_core
  zh_wwlib_string
  zh_wwlib_refcount
  zh_wwlib_containers
  zh_wwlib_crc
  zh_wwlib_random
  zh_wwlib_thread
  zh_wwlib_mutex
  zh_wwlib_targa
  zh_wwdebug_core
  zh_compression_manager
  zh_compression_eac
)

target_compile_options(screen-mapper-apply-smoke PRIVATE
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(screen-mapper-apply-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sEXIT_RUNTIME=1"
)

add_executable(edge-mapper-apply-smoke
  tests/edge_mapper_apply_smoke.cpp
)

set_target_properties(edge-mapper-apply-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(edge-mapper-apply-smoke PRIVATE
  zh_ww3d2_compile_frontier
  zh_browser_d3d8
  zh_gameengine_common_core
  zh_wwmath_lookup
  zh_wwmath_core
  zh_wwsaveload_full
  zh_wwsaveload_core
  zh_wwlib_file_ini
  zh_wwlib_file_core
  zh_wwlib_stream_core
  zh_wwlib_string
  zh_wwlib_refcount
  zh_wwlib_containers
  zh_wwlib_crc
  zh_wwlib_random
  zh_wwlib_thread
  zh_wwlib_mutex
  zh_wwlib_targa
  zh_wwdebug_core
  zh_compression_manager
  zh_compression_eac
)

target_compile_options(edge-mapper-apply-smoke PRIVATE
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(edge-mapper-apply-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sEXIT_RUNTIME=1"
)

add_executable(ws-environment-mapper-apply-smoke
  tests/ws_environment_mapper_apply_smoke.cpp
)

set_target_properties(ws-environment-mapper-apply-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(ws-environment-mapper-apply-smoke PRIVATE
  zh_ww3d2_compile_frontier
  zh_browser_d3d8
  zh_gameengine_common_core
  zh_wwmath_lookup
  zh_wwmath_core
  zh_wwsaveload_full
  zh_wwsaveload_core
  zh_wwlib_file_ini
  zh_wwlib_file_core
  zh_wwlib_stream_core
  zh_wwlib_string
  zh_wwlib_refcount
  zh_wwlib_containers
  zh_wwlib_crc
  zh_wwlib_random
  zh_wwlib_thread
  zh_wwlib_mutex
  zh_wwlib_targa
  zh_wwdebug_core
  zh_compression_manager
  zh_compression_eac
)

target_compile_options(ws-environment-mapper-apply-smoke PRIVATE
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(ws-environment-mapper-apply-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sEXIT_RUNTIME=1"
)

add_executable(grid-environment-mapper-apply-smoke
  tests/grid_environment_mapper_apply_smoke.cpp
)

set_target_properties(grid-environment-mapper-apply-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(grid-environment-mapper-apply-smoke PRIVATE
  zh_ww3d2_compile_frontier
  zh_browser_d3d8
  zh_gameengine_common_core
  zh_wwmath_lookup
  zh_wwmath_core
  zh_wwsaveload_full
  zh_wwsaveload_core
  zh_wwlib_file_ini
  zh_wwlib_file_core
  zh_wwlib_stream_core
  zh_wwlib_string
  zh_wwlib_refcount
  zh_wwlib_containers
  zh_wwlib_crc
  zh_wwlib_random
  zh_wwlib_thread
  zh_wwlib_mutex
  zh_wwlib_targa
  zh_wwdebug_core
  zh_compression_manager
  zh_compression_eac
)

target_compile_options(grid-environment-mapper-apply-smoke PRIVATE
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(grid-environment-mapper-apply-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sEXIT_RUNTIME=1"
)

add_executable(grid-ws-environment-mapper-apply-smoke
  tests/grid_ws_environment_mapper_apply_smoke.cpp
)

set_target_properties(grid-ws-environment-mapper-apply-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(grid-ws-environment-mapper-apply-smoke PRIVATE
  zh_ww3d2_compile_frontier
  zh_browser_d3d8
  zh_gameengine_common_core
  zh_wwmath_lookup
  zh_wwmath_core
  zh_wwsaveload_full
  zh_wwsaveload_core
  zh_wwlib_file_ini
  zh_wwlib_file_core
  zh_wwlib_stream_core
  zh_wwlib_string
  zh_wwlib_refcount
  zh_wwlib_containers
  zh_wwlib_crc
  zh_wwlib_random
  zh_wwlib_thread
  zh_wwlib_mutex
  zh_wwlib_targa
  zh_wwdebug_core
  zh_compression_manager
  zh_compression_eac
)

target_compile_options(grid-ws-environment-mapper-apply-smoke PRIVATE
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(grid-ws-environment-mapper-apply-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sEXIT_RUNTIME=1"
)

add_executable(ww3d2-shatterplanes-loader-smoke
  tests/ww3d2_shatterplanes_loader_smoke.cpp
)

set_target_properties(ww3d2-shatterplanes-loader-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(ww3d2-shatterplanes-loader-smoke PRIVATE
  zh_ww3d2_compile_frontier
  zh_gameengine_common_core
  zh_wwmath_lookup
  zh_wwmath_core
  zh_wwsaveload_full
  zh_wwsaveload_core
  zh_wwlib_file_ini
  zh_wwlib_file_core
  zh_wwlib_stream_core
  zh_wwlib_string
  zh_wwlib_refcount
  zh_wwlib_containers
  zh_wwlib_crc
  zh_wwlib_random
  zh_wwdebug_core
  zh_compression_manager
  zh_compression_eac
)

target_compile_options(ww3d2-shatterplanes-loader-smoke PRIVATE
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(ww3d2-shatterplanes-loader-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  ${CNC_EXCEPTION_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sEXIT_RUNTIME=1"
  "SHELL:-sEXPORTED_FUNCTIONS=['_run_ww3d2_shatterplanes_loader_smoke','_malloc','_free']"
  "SHELL:-sEXPORTED_RUNTIME_METHODS=['ccall']"
)

add_executable(ww3d2-shipped-mesh-loader-smoke
  tests/ww3d2_shipped_mesh_loader_smoke.cpp
  src/wasm_win32_gdi_stub.cpp
)

set_target_properties(ww3d2-shipped-mesh-loader-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(ww3d2-shipped-mesh-loader-smoke PRIVATE
  zh_ww3d2_compile_frontier
  zh_browser_d3d8
  zh_gameengine_globaldata_runtime
  zh_gameengine_debug_runtime
  zh_gameengine_common_core
  zh_wwmath_lookup
  zh_wwmath_core
  zh_wwsaveload_full
  zh_wwsaveload_core
  zh_wwlib_file_ini
  zh_wwlib_file_core
  zh_wwlib_stream_core
  zh_wwlib_string
  zh_wwlib_refcount
  zh_wwlib_containers
  zh_wwlib_crc
  zh_wwlib_random
  zh_wwlib_thread
  zh_wwlib_mutex
  zh_wwlib_targa
  zh_wwdebug_core
  zh_compression_manager
  zh_compression_eac
)

target_compile_options(ww3d2-shipped-mesh-loader-smoke PRIVATE
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(ww3d2-shipped-mesh-loader-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  ${CNC_EXCEPTION_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sNODERAWFS=1"
  "SHELL:-sEXIT_RUNTIME=1"
  "SHELL:-sEXPORTED_FUNCTIONS=['_run_ww3d2_shipped_mesh_loader_smoke']"
  "SHELL:-sEXPORTED_RUNTIME_METHODS=['ccall']"
)

set(WW3D2_REAL_HEADER_SMOKE_TARGETS
  ww3d2-light-render-smoke
  ww3d2-dx8wrapper-loader-smoke
  ww3d2-dx8wrapper-render-smoke
  ww3d2-texture-loader-smoke
  wwshade-cubemap-apply-smoke
  matrixmapper-apply-smoke
  classic-environment-mapper-apply-smoke
  environment-mapper-apply-smoke
  screen-mapper-apply-smoke
  edge-mapper-apply-smoke
  ws-environment-mapper-apply-smoke
  grid-environment-mapper-apply-smoke
  grid-ws-environment-mapper-apply-smoke
  ww3d2-shatterplanes-loader-smoke
  ww3d2-shipped-mesh-loader-smoke
)

foreach(target IN LISTS WW3D2_REAL_HEADER_SMOKE_TARGETS)
  target_compile_definitions(${target} PRIVATE
    CNC_PORT_REAL_GAMELOGIC_HEADER=1
    WASM_USE_ORIGINAL_GLOBALDATA=1
  )
  target_compile_options(${target} PRIVATE
    "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
    "-iquote${GAMEENGINE_INCLUDE_DIR}"
    "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
    "-iquote${GAMEENGINE_DIR}/Source"
    "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
    "-iquote${MAIN_DIR}"
    "-iquote${ZH_LIB_INCLUDE_DIR}"
    "-iquote${ZH_CODE_DIR}/Libraries/Source"
    "-iquote${WWVEGAS_DIR}"
    "-iquote${WWVEGAS_DIR}/WW3D2"
    "-iquote${WWDEBUG_DIR}"
    "-iquote${WWLIB_DIR}"
    "-iquote${WWMATH_DIR}"
    "-iquote${WWSAVELOAD_DIR}"
    "-iquote${COMPRESSION_DIR}"
    "-iquote${COMPRESSION_EAC_DIR}"
    "-iquote${WASM_SHIMS_DIR}"
  )
endforeach()

add_executable(gameengine-common-core-smoke
  tests/gameengine_common_core_smoke.cpp
)

set_target_properties(gameengine-common-core-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(gameengine-common-core-smoke PRIVATE
  # Keep real INI before common_core so INI.cpp satisfies parser symbols before
  # the legacy common-core INI compat object can be pulled from the archive.
  zh_gameengine_real_ini_runtime
  zh_gameengine_common_core
  zh_gameengine_globaldata_runtime
  zh_gameengine_debug_runtime
)

target_compile_definitions(gameengine-common-core-smoke PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(gameengine-common-core-smoke PRIVATE
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(gameengine-common-core-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
)

add_executable(miles-audio-open-device-smoke
  tests/miles_audio_open_device_smoke.cpp
)

set_target_properties(miles-audio-open-device-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(miles-audio-open-device-smoke PRIVATE
  zh_miles_audio_device_compile_frontier
  zh_gameengine_common_core
  zh_wwmath_core
)

target_compile_options(miles-audio-open-device-smoke PRIVATE
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/Miles6/include"
  "-iquote${WWAUDIO_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

target_link_options(miles-audio-open-device-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
)

add_executable(miles-audio-play-sample-smoke
  tests/miles_audio_play_sample_smoke.cpp
)

set_target_properties(miles-audio-play-sample-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(miles-audio-play-sample-smoke PRIVATE
  zh_miles_audio_device_compile_frontier
  zh_gameengine_common_core
  zh_wwmath_core
)

target_compile_options(miles-audio-play-sample-smoke PRIVATE
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/Miles6/include"
  "-iquote${WWAUDIO_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

target_link_options(miles-audio-play-sample-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  # Real IMA ADPCM payloads are read from disk (--adpcm) and the decoded PCM
  # WAV is dumped back out (--adpcm-dump) for reference comparison.
  "SHELL:-sNODERAWFS=1"
)

add_executable(gamenetwork-core-smoke
  tests/gamenetwork_core_smoke.cpp
)

set_target_properties(gamenetwork-core-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(gamenetwork-core-smoke PRIVATE
  zh_gamenetwork_core
  zh_gameengine_globaldata_runtime
  zh_gameengine_debug_runtime
)

target_compile_definitions(gamenetwork-core-smoke PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(gamenetwork-core-smoke PRIVATE
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(gamenetwork-core-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
)

add_executable(gamenetwork-download-manager-smoke
  tests/gamenetwork_download_manager_smoke.cpp
)

set_target_properties(gamenetwork-download-manager-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(gamenetwork-download-manager-smoke PRIVATE
  zh_gameengine_globaldata_runtime
  zh_gameengine_debug_runtime
  zh_gamenetwork_core
  zh_gameclient_text
)

target_compile_options(gamenetwork-download-manager-smoke PRIVATE
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(gamenetwork-download-manager-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
)

add_executable(gameengine-real-big-smoke
  tests/gameengine_real_big_smoke.cpp
)

set_target_properties(gameengine-real-big-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(gameengine-real-big-smoke PRIVATE
  zh_gameengine_globaldata_runtime
  zh_gameengine_debug_runtime
  zh_gameengine_common_core
)

target_compile_options(gameengine-real-big-smoke PRIVATE
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(gameengine-real-big-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  ${CNC_EXCEPTION_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sNODERAWFS=1"
  "SHELL:-sEXPORTED_FUNCTIONS=['_run_real_big_smoke','_run_real_big_index_smoke']"
  "SHELL:-sEXPORTED_RUNTIME_METHODS=['ccall']"
)

add_executable(gameengine-real-big-browser-smoke
  tests/gameengine_real_big_smoke.cpp
)

set_target_properties(gameengine-real-big-browser-smoke PROPERTIES
  SUFFIX ".js"
)

target_link_libraries(gameengine-real-big-browser-smoke PRIVATE
  zh_gameengine_globaldata_runtime
  zh_gameengine_debug_runtime
  zh_gameengine_common_core
)

target_compile_definitions(gameengine-real-big-browser-smoke PRIVATE
  REAL_BIG_SMOKE_NO_MAIN
)

target_compile_options(gameengine-real-big-browser-smoke PRIVATE
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(gameengine-real-big-browser-smoke PRIVATE
  "SHELL:-sENVIRONMENT=web,worker"
  "SHELL:-sMODULARIZE=1"
  "SHELL:-sEXPORT_ES6=1"
  "SHELL:-sEXPORT_NAME=createGameEngineRealBigBrowserSmokeModule"
  ${CNC_ASSERTIONS_LINK_OPTION}
  ${CNC_EXCEPTION_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sEXPORTED_FUNCTIONS=['_run_real_big_smoke','_run_real_big_index_smoke']"
  "SHELL:-sEXPORTED_RUNTIME_METHODS=['ccall','FS']"
)

set(FINAL_REAL_HEADER_SMOKE_TARGETS
  gamenetwork-download-manager-smoke
  gameengine-real-big-smoke
  gameengine-real-big-browser-smoke
)

foreach(target IN LISTS FINAL_REAL_HEADER_SMOKE_TARGETS)
  target_compile_definitions(${target} PRIVATE
    CNC_PORT_REAL_GAMELOGIC_HEADER=1
    WASM_USE_ORIGINAL_GLOBALDATA=1
  )
  target_compile_options(${target} PRIVATE
    "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
    "-iquote${GAMEENGINE_INCLUDE_DIR}"
    "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
    "-iquote${GAMEENGINE_DIR}/Source"
    "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
    "-iquote${MAIN_DIR}"
    "-iquote${ZH_LIB_INCLUDE_DIR}"
    "-iquote${ZH_CODE_DIR}/Libraries/Source"
    "-iquote${WWVEGAS_DIR}"
    "-iquote${WWVEGAS_DIR}/WW3D2"
    "-iquote${WWDEBUG_DIR}"
    "-iquote${WWLIB_DIR}"
    "-iquote${WWMATH_DIR}"
    "-iquote${WWSAVELOAD_DIR}"
    "-iquote${COMPRESSION_DIR}"
    "-iquote${COMPRESSION_EAC_DIR}"
    "-iquote${WASM_SHIMS_DIR}"
  )
endforeach()

add_executable(bink-video-provider-smoke
  tests/bink_video_provider_smoke.cpp
)

set_target_properties(bink-video-provider-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(bink-video-provider-smoke PRIVATE
  zh_browser_bink
)

target_compile_definitions(bink-video-provider-smoke PRIVATE
  BINK_VIDEO_PROVIDER_SMOKE_NO_MAIN
)

target_compile_options(bink-video-provider-smoke PRIVATE
  -Wall
  -Wextra
  -Wpedantic
)

target_link_options(bink-video-provider-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=33554432"
  "SHELL:-sNODERAWFS=1"
  "SHELL:-sEXPORTED_FUNCTIONS=['_run_bink_video_provider_smoke','_run_bink_video_sidecar_provider_smoke','_run_bink_video_sidecar_copy_bridge_smoke']"
  "SHELL:-sEXPORTED_RUNTIME_METHODS=['ccall']"
)

add_executable(bink-video-provider-browser-smoke
  tests/bink_video_provider_smoke.cpp
)

set_target_properties(bink-video-provider-browser-smoke PROPERTIES
  SUFFIX ".js"
)

target_link_libraries(bink-video-provider-browser-smoke PRIVATE
  zh_browser_bink
)

target_compile_definitions(bink-video-provider-browser-smoke PRIVATE
  BINK_VIDEO_PROVIDER_SMOKE_NO_MAIN
)

target_compile_options(bink-video-provider-browser-smoke PRIVATE
  -Wall
  -Wextra
  -Wpedantic
)

target_link_options(bink-video-provider-browser-smoke PRIVATE
  "SHELL:-sENVIRONMENT=web,worker"
  "SHELL:-sMODULARIZE=1"
  "SHELL:-sEXPORT_ES6=1"
  "SHELL:-sEXPORT_NAME=createBinkVideoProviderBrowserSmokeModule"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=33554432"
  "SHELL:-sEXPORTED_FUNCTIONS=['_run_bink_video_provider_smoke','_run_bink_video_sidecar_provider_smoke','_run_bink_video_sidecar_copy_bridge_smoke']"
  "SHELL:-sEXPORTED_RUNTIME_METHODS=['ccall','FS']"
)

add_executable(bink-videoplayer-runtime-smoke
  tests/bink_videoplayer_runtime_smoke.cpp
)

set_target_properties(bink-videoplayer-runtime-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(bink-videoplayer-runtime-smoke PRIVATE
  zh_bink_video_device_compile_frontier
  zh_gameengine_globaldata_runtime
  zh_gameengine_debug_runtime
  zh_gameclient_utility
  zh_gameclient_utility_smoke_ini_support
)

target_compile_definitions(bink-videoplayer-runtime-smoke PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(bink-videoplayer-runtime-smoke PRIVATE
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WASM_SHIMS_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(bink-videoplayer-runtime-smoke PRIVATE
  "SHELL:-sENVIRONMENT=node"
  "SHELL:-sSINGLE_FILE=1"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sNODERAWFS=1"
  "SHELL:-sEXIT_RUNTIME=1"
)

add_executable(bink-videoplayer-browser-runtime-smoke
  tests/bink_videoplayer_runtime_smoke.cpp
)

set_target_properties(bink-videoplayer-browser-runtime-smoke PROPERTIES
  SUFFIX ".js"
)

target_link_libraries(bink-videoplayer-browser-runtime-smoke PRIVATE
  zh_bink_video_device_compile_frontier
  zh_gameengine_globaldata_runtime
  zh_gameengine_debug_runtime
  zh_gameclient_utility
  zh_gameclient_utility_smoke_ini_support
)

target_compile_definitions(bink-videoplayer-browser-runtime-smoke PRIVATE
  BINK_VIDEOPLAYER_RUNTIME_SMOKE_NO_MAIN
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(bink-videoplayer-browser-runtime-smoke PRIVATE
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WASM_SHIMS_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-register
  -Wno-writable-strings
)

target_link_options(bink-videoplayer-browser-runtime-smoke PRIVATE
  "SHELL:-sENVIRONMENT=web,worker"
  "SHELL:-sMODULARIZE=1"
  "SHELL:-sEXPORT_ES6=1"
  "SHELL:-sEXPORT_NAME=createBinkVideoPlayerBrowserRuntimeSmokeModule"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sEXPORTED_FUNCTIONS=['_run_bink_videoplayer_sidecar_copy_bridge_smoke']"
  "SHELL:-sEXPORTED_RUNTIME_METHODS=['ccall','FS']"
)

add_library(zh_score_screen_movie_runtime STATIC
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/ScoreScreen.cpp"
)

target_compile_definitions(zh_score_screen_movie_runtime PRIVATE
  __PRERTS_H__
  CNC_PORT_SCORE_SCREEN_MOVIE_TEST_HOOKS=1
)

target_include_directories(zh_score_screen_movie_runtime PRIVATE
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DIR}/Source"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${MAIN_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${ZH_CODE_DIR}/Libraries/Source"
  "${WWVEGAS_DIR}"
  "${WWVEGAS_DIR}/WW3D2"
  "${WWDEBUG_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
)

target_compile_options(zh_score_screen_movie_runtime PRIVATE
  -ffunction-sections
  -fdata-sections
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

add_executable(bink-w3d-video-buffer-browser-smoke
  tests/bink_w3d_video_buffer_upload_smoke.cpp
)

set_target_properties(bink-w3d-video-buffer-browser-smoke PROPERTIES
  SUFFIX ".js"
)

target_link_libraries(bink-w3d-video-buffer-browser-smoke PRIVATE
  zh_score_screen_movie_runtime
  zh_bink_video_device_compile_frontier
  zh_gameengine_globaldata_runtime
  zh_gameengine_debug_runtime
  zh_gameclient_utility
  zh_gamenetwork_core
  zh_w3d_display_drawimage_runtime
  zh_gameclient_utility_smoke_ini_support
  zh_ww3d2_compile_frontier
  zh_browser_d3d8
  zh_wwmath_lookup
  zh_wwmath_core
  zh_wwsaveload_full
  zh_wwsaveload_core
  zh_wwlib_file_ini
  zh_wwlib_file_core
  zh_wwlib_stream_core
  zh_wwlib_string
  zh_wwlib_refcount
  zh_wwlib_containers
  zh_wwlib_crc
  zh_wwlib_random
  zh_wwlib_thread
  zh_wwlib_mutex
  zh_wwlib_targa
  zh_wwdebug_profile
  zh_wwdebug_core
  zh_compression_manager
  zh_compression_eac
)

target_compile_definitions(bink-w3d-video-buffer-browser-smoke PRIVATE
  CNC_PORT_REAL_GAMELOGIC_HEADER=1
  WASM_USE_ORIGINAL_GLOBALDATA=1
)

target_compile_options(bink-w3d-video-buffer-browser-smoke PRIVATE
  "-include${WASM_SHIMS_DIR}/windows.h"
  "-include${WASM_SHIMS_DIR}/mmsystem.h"
  "-include${WWVEGAS_PORT_SHIM}"
  "-include${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_prerts_real.h"
  "-iquote${GAMEENGINE_INCLUDE_DIR}"
  "-iquote${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "-iquote${GAMEENGINE_DIR}/Source"
  "-iquote${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "-iquote${MAIN_DIR}"
  "-iquote${ZH_LIB_INCLUDE_DIR}"
  "-iquote${ZH_CODE_DIR}/Libraries/Source"
  "-iquote${WWVEGAS_DIR}"
  "-iquote${WWVEGAS_DIR}/WW3D2"
  "-iquote${WWDEBUG_DIR}"
  "-iquote${WWLIB_DIR}"
  "-iquote${WWMATH_DIR}"
  "-iquote${WWSAVELOAD_DIR}"
  "-iquote${COMPRESSION_DIR}"
  "-iquote${COMPRESSION_EAC_DIR}"
  "-iquote${WASM_SHIMS_DIR}"
  -fms-extensions
  -Wall
  -Wextra
  -Wpedantic
  -Wno-extra-tokens
  -Wno-implicit-exception-spec-mismatch
  -Wno-logical-not-parentheses
  -Wno-new-returns-null
  -Wno-register
  -Wno-undefined-bool-conversion
  -Wno-unknown-pragmas
  -Wno-unused-parameter
  -Wno-writable-strings
)

target_link_options(bink-w3d-video-buffer-browser-smoke PRIVATE
  "SHELL:-sENVIRONMENT=web,worker"
  "SHELL:-sMODULARIZE=1"
  "SHELL:-sEXPORT_ES6=1"
  "SHELL:-sEXPORT_NAME=createBinkW3DVideoBufferBrowserSmokeModule"
  ${CNC_ASSERTIONS_LINK_OPTION}
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=134217728"
  "SHELL:-Wl,--gc-sections"
  "SHELL:-sEXPORTED_FUNCTIONS=['_run_bink_w3d_video_buffer_upload_smoke']"
  "SHELL:-sEXPORTED_RUNTIME_METHODS=['ccall','FS']"
)

# Hot-path aggregate: everything `npm run test:startup-vertical` executes.
# The real-init boot loop builds this (via CNC_BUILD_TARGETS in
# tools/build_wasm.sh) instead of the full probe/smoke surface, so touched
# engine headers do not force a rebuild of every legacy smoke executable.
# Keep this list in sync with tools/run_startup_vertical_smoke.mjs.
add_custom_target(zh_startup_vertical_hotpath
  DEPENDS
    cnc-port
    win32-gameengine-lifetime-smoke
    win32-gameengine-original-lifetime-smoke
    miles-audio-open-device-smoke
    w3d-gamewindow-manager-smoke
    w3d-window-layout-script-smoke
    gamelogic-new-game-dispatch-smoke
)

# ---------------------------------------------------------------------------
# P2-prep (lane P2-prep, appended): OPFS-as-disk read layer.
#
#   - src/wasm_opfs_files.cpp: strong defs for the weak fd-intercept hooks
#     declared in shims/io.h (virtual fds backed by realm-local
#     FileSystemSyncAccessHandle reads via globalThis.__cncOpfs*). Compiled
#     into cnc-port in BOTH builds; inert unless JS registers a prefix
#     (cnc_port_opfs_register_prefix) AND stages handles
#     (harness/opfs_realm_files.mjs). Every other target that includes
#     shims/io.h does not link this file, so the weak hooks resolve to null
#     and behavior is byte-identical.
#   - src/wasm_opfs_probe.cpp: disposable P2-prep proof probe
#     (harness/p2_opfs_probe.{html,mjs}); pthread body only compiles under
#     __EMSCRIPTEN_PTHREADS__ (the CNC_PORT_THREADS build), the default build
#     gets inert stub exports.
# ---------------------------------------------------------------------------
target_sources(cnc-port PRIVATE
  src/wasm_opfs_files.cpp
  src/wasm_opfs_probe.cpp
)
