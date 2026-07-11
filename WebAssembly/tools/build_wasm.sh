#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
if [[ -n "${CNC_BUILD_DIR:-}" ]]; then
  build_dir="$(cd "${wasm_dir}" && pwd)/${CNC_BUILD_DIR}"
else
  build_dir="${wasm_dir}/build/wasm"
fi
build_type="${BUILD_TYPE:-Debug}"

dist_dir="${CNC_DIST_DIR:-dist}"
if [[ "${build_type}" == "Release" && -z "${CNC_DIST_DIR:-}" ]]; then
  dist_dir="dist-release"
fi

if ! command -v emcmake >/dev/null 2>&1; then
  echo "emcmake is required. Activate Emscripten before running this script." >&2
  exit 1
fi

if ! command -v cmake >/dev/null 2>&1; then
  echo "cmake is required." >&2
  exit 1
fi

cmake_args=(
  -S "${wasm_dir}"
  -B "${build_dir}"
  -DCMAKE_BUILD_TYPE="${build_type}"
)

if [[ "${build_type}" == "Release" || -n "${CNC_DIST_DIR:-}" ]]; then
  cmake_args+=("-DCNC_DIST_DIR=${dist_dir}")
fi

if [[ -n "${CMAKE_CXX_FLAGS:-}" ]]; then
  cmake_args+=("-DCMAKE_CXX_FLAGS=${CMAKE_CXX_FLAGS}")
fi

if [[ "${WASM_EXCEPTIONS:-0}" == "1" || "${WASM_EXCEPTIONS:-0}" == "ON" || "${WASM_EXCEPTIONS:-0}" == "true" ]]; then
  cmake_args+=("-DCNC_WASM_NATIVE_EXCEPTIONS=ON")
else
  cmake_args+=("-DCNC_WASM_NATIVE_EXCEPTIONS=OFF")
fi

# Engine-thread P0 spike: CNC_PORT_THREADS=1 builds cnc-port with pthreads
# (see CNC_PORT_THREADS in CMakeLists.txt). Always pair it with a dedicated
# CNC_BUILD_DIR/CNC_DIST_DIR (npm run build:port:threaded does) — -pthread is
# a global compile flag in that configuration.
cnc_port_threads=0
if [[ "${CNC_PORT_THREADS:-0}" == "1" || "${CNC_PORT_THREADS:-0}" == "ON" || "${CNC_PORT_THREADS:-0}" == "true" ]]; then
  cnc_port_threads=1
  cmake_args+=("-DCNC_PORT_THREADS=ON")
else
  cmake_args+=("-DCNC_PORT_THREADS=OFF")
fi

if [[ -z "${CMAKE_GENERATOR:-}" ]] && command -v ninja >/dev/null 2>&1; then
  cmake_args+=(-G Ninja)
fi

emcmake cmake "${cmake_args[@]}"

check_cnc_port_artifacts() {
  test -f "${wasm_dir}/${dist_dir}/cnc-port.js"
  test -f "${wasm_dir}/${dist_dir}/cnc-port.wasm"
  if [[ "${cnc_port_threads}" == "1" ]]; then
    # pthread builds also emit the worker loader next to the main JS.
    test -f "${wasm_dir}/${dist_dir}/cnc-port.worker.js"
  fi
}

# Hot-path support: when CNC_BUILD_TARGETS is set (space-separated CMake
# target names), build only those targets instead of the full ~90-executable
# probe/smoke surface. The real-init boot loop should use this via
# `npm run build:port` / `npm run build:startup-vertical`; plain
# `npm run build:wasm` still builds everything for the full regression suite.
if [[ -n "${CNC_BUILD_TARGETS:-}" ]]; then
  read -r -a build_targets <<<"${CNC_BUILD_TARGETS}"
  target_args=()
  builds_cnc_port=false
  for t in "${build_targets[@]}"; do
    target_args+=(--target "$t")
    if [[ "$t" == "cnc-port" ]]; then
      builds_cnc_port=true
    fi
  done
  cmake --build "${build_dir}" "${target_args[@]}"
  if [[ "${builds_cnc_port}" == "true" ]]; then
    check_cnc_port_artifacts
  fi
else
  cmake --build "${build_dir}"
  check_cnc_port_artifacts
fi

echo "${wasm_dir}/${dist_dir}/cnc-port.js"
