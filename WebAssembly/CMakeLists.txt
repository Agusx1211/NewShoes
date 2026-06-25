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
set(GAMEENGINE_DIR "${ZH_CODE_DIR}/GameEngine")
set(GAMEENGINE_INCLUDE_DIR "${GAMEENGINE_DIR}/Include")
set(GAMEENGINE_COMMON_DIR "${GAMEENGINE_DIR}/Source/Common")
set(GAMEENGINE_GAMECLIENT_DIR "${GAMEENGINE_DIR}/Source/GameClient")
set(GAMEENGINE_GAMENETWORK_DIR "${GAMEENGINE_DIR}/Source/GameNetwork")
set(GAMEENGINE_DEVICE_DIR "${ZH_CODE_DIR}/GameEngineDevice")
set(GAMEENGINE_DEVICE_INCLUDE_DIR "${GAMEENGINE_DEVICE_DIR}/Include")
set(WASM_SHIMS_DIR "${CMAKE_CURRENT_SOURCE_DIR}/shims")
set(WWVEGAS_PORT_SHIM "${WASM_SHIMS_DIR}/wwvegas_port.h")
set(WWVEGAS_MUTEX_PORT_SHIM "${WASM_SHIMS_DIR}/wwvegas_mutex_port.h")
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
  WWDEBUG=1
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

add_library(zh_gameengine_common_core STATIC
  "${WASM_SHIMS_DIR}/INICommonCompat.cpp"
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
  "${GAMEENGINE_COMMON_DIR}/INI/INIDamageFX.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIMapData.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIModel.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIMiscAudio.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INIMultiplayer.cpp"
  "${GAMEENGINE_COMMON_DIR}/INI/INISpecialPower.cpp"
  "${GAMEENGINE_COMMON_DIR}/Audio/AudioEventRTS.cpp"
  "${GAMEENGINE_COMMON_DIR}/MultiplayerSettings.cpp"
  "${GAMEENGINE_COMMON_DIR}/MessageStream.cpp"
  "${GAMEENGINE_COMMON_DIR}/PartitionSolver.cpp"
  "${GAMEENGINE_COMMON_DIR}/PerfTimer.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Energy.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Handicap.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/MissionStats.cpp"
  "${GAMEENGINE_COMMON_DIR}/RTS/Money.cpp"
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
  "${GAMEENGINE_DEVICE_DIR}/Source/Win32Device/Common/Win32LocalFile.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/Win32Device/Common/Win32LocalFileSystem.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/Win32Device/Common/Win32BIGFile.cpp"
  "${GAMEENGINE_DEVICE_DIR}/Source/Win32Device/Common/Win32BIGFileSystem.cpp"
)

target_include_directories(zh_gameengine_common_core PUBLIC
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${WWVEGAS_DIR}"
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
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
)

target_link_libraries(zh_gameengine_common_core PUBLIC
  zh_compression_manager
)

add_library(zh_gameclient_utility STATIC
  "${WASM_SHIMS_DIR}/INICompat.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Color.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Credits.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Display.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/System/DebugDisplay.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/DisplayString.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/DisplayStringManager.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/DrawGroupInfo.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/DrawableManager.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GraphDraw.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/AnimateWindowManager.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ChallengeGenerals.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBarPrintPositions.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ControlBar/ControlBarResizer.cpp"
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
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/ExtendedMessageBox.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/IMECandidate.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/CreditsMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/PopupCommunicator.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/SinglePlayerMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLCustomScoreScreen.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLMessageWindow.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLQMScoreScreen.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/Menus/WOLStatusMenu.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GUICallbacks/MessageBox.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GameFont.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GameWindow.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GameWindowGlobal.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GameWindowManager.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GameWindowManagerScript.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GameWindowTransitions.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/GameWindowTransitionsStyles.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/HeaderTemplate.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/ProcessAnimateWindow.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/Shell/ShellMenuScheme.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/WinInstanceData.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/WindowLayout.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GUI/WindowVideoManager.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GlobalLanguage.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/GameText.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/MessageStream/HintSpy.cpp"
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
  "${GAMEENGINE_GAMECLIENT_DIR}/Snow.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Statistics.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/System/Anim2D.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/System/Image.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/System/RayEffect.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Terrain/TerrainRoads.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/View.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/VideoPlayer.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/VideoStream.cpp"
  "${GAMEENGINE_GAMECLIENT_DIR}/Water.cpp"
)

set_source_files_properties("${GAMEENGINE_GAMECLIENT_DIR}/VideoStream.cpp" PROPERTIES
  COMPILE_OPTIONS "-include;${WASM_SHIMS_DIR}/PreRTS.h"
)

target_include_directories(zh_gameclient_utility PUBLIC
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${WWVEGAS_DIR}"
  "${WWMATH_DIR}"
  "${WWLIB_DIR}"
)

target_compile_options(zh_gameclient_utility PRIVATE
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

add_library(zh_gamenetwork_core STATIC
  "${GAMEENGINE_GAMENETWORK_DIR}/Connection.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/FileTransfer.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/FrameData.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/FrameDataManager.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/FrameMetrics.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/GameMessageParser.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/FirewallHelper.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/NetCommandList.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/NetCommandMsg.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/NetCommandRef.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/NetCommandWrapperList.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/NetMessageStream.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/NetPacket.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/NetworkUtil.cpp"
  "${GAMEENGINE_GAMENETWORK_DIR}/User.cpp"
)

target_include_directories(zh_gamenetwork_core PUBLIC
  "${WASM_SHIMS_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}"
  "${GAMEENGINE_INCLUDE_DIR}/Precompiled"
  "${GAMEENGINE_DEVICE_INCLUDE_DIR}"
  "${ZH_LIB_INCLUDE_DIR}"
  "${WWVEGAS_DIR}"
  "${WWMATH_DIR}"
  "${WWLIB_DIR}"
)

target_compile_options(zh_gamenetwork_core PRIVATE
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

target_link_libraries(zh_gamenetwork_core PUBLIC
  zh_gameengine_common_core
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
  "SHELL:-sASSERTIONS=1"
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
  "SHELL:-sASSERTIONS=1"
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
  "SHELL:-sASSERTIONS=1"
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
  "SHELL:-sASSERTIONS=1"
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
  "SHELL:-sASSERTIONS=1"
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
  "SHELL:-sASSERTIONS=1"
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
  "SHELL:-sASSERTIONS=1"
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
  "SHELL:-sASSERTIONS=1"
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
  "SHELL:-sASSERTIONS=1"
)

add_executable(wwlib-legacy-platform-smoke
  tests/wwlib_legacy_platform_smoke.cpp
)

set_target_properties(wwlib-legacy-platform-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(wwlib-legacy-platform-smoke PRIVATE
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
  "SHELL:-sASSERTIONS=1"
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
  "SHELL:-sASSERTIONS=1"
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
  "SHELL:-sASSERTIONS=1"
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
  "SHELL:-sASSERTIONS=1"
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
  "SHELL:-sASSERTIONS=1"
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
  "SHELL:-sASSERTIONS=1"
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
  "${WWLIB_DIR}"
  "${WWMATH_DIR}"
)

target_compile_options(gameengine-header-case-smoke PRIVATE
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
  "SHELL:-sASSERTIONS=1"
  "SHELL:-sEXIT_RUNTIME=1"
)

add_executable(gameclient-utility-smoke
  tests/gameclient_utility_smoke.cpp
)

set_target_properties(gameclient-utility-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(gameclient-utility-smoke PRIVATE
  zh_gameclient_utility
)

target_compile_options(gameclient-utility-smoke PRIVATE
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
  "SHELL:-sASSERTIONS=1"
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
)

add_executable(gameengine-common-core-smoke
  tests/gameengine_common_core_smoke.cpp
)

set_target_properties(gameengine-common-core-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(gameengine-common-core-smoke PRIVATE
  zh_gameengine_common_core
)

target_compile_options(gameengine-common-core-smoke PRIVATE
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
  "SHELL:-sASSERTIONS=1"
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
)

add_executable(gamenetwork-core-smoke
  tests/gamenetwork_core_smoke.cpp
)

set_target_properties(gamenetwork-core-smoke PROPERTIES
  SUFFIX ".cjs"
)

target_link_libraries(gamenetwork-core-smoke PRIVATE
  zh_gamenetwork_core
)

target_compile_options(gamenetwork-core-smoke PRIVATE
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
  "SHELL:-sASSERTIONS=1"
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
  "SHELL:-sASSERTIONS=1"
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
  "SHELL:-sASSERTIONS=1"
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sINITIAL_MEMORY=67108864"
  "SHELL:-sEXPORTED_FUNCTIONS=['_run_real_big_smoke','_run_real_big_index_smoke']"
  "SHELL:-sEXPORTED_RUNTIME_METHODS=['ccall','FS']"
)
