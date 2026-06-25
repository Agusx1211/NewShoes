cmake_minimum_required(VERSION 3.16)

project(CnCGeneralsZeroHourWasmPort LANGUAGES CXX)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "Configure this target with emcmake cmake from Emscripten.")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/dist")

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
