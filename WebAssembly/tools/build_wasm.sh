#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
build_dir="${wasm_dir}/build/wasm"
build_type="${BUILD_TYPE:-Debug}"

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

if [[ -z "${CMAKE_GENERATOR:-}" ]] && command -v ninja >/dev/null 2>&1; then
  cmake_args+=(-G Ninja)
fi

emcmake cmake "${cmake_args[@]}"

# Hot-path support: when CNC_BUILD_TARGETS is set (space-separated CMake
# target names), build only those targets instead of the full ~90-executable
# probe/smoke surface. The real-init boot loop should use this via
# `npm run build:port` / `npm run build:startup-vertical`; plain
# `npm run build:wasm` still builds everything for the full regression suite.
if [[ -n "${CNC_BUILD_TARGETS:-}" ]]; then
  read -r -a build_targets <<<"${CNC_BUILD_TARGETS}"
  target_args=()
  for t in "${build_targets[@]}"; do
    target_args+=(--target "$t")
  done
  cmake --build "${build_dir}" "${target_args[@]}"
else
  cmake --build "${build_dir}"

  test -f "${wasm_dir}/dist/cnc-port.js"
  test -f "${wasm_dir}/dist/cnc-port.wasm"
fi

echo "${wasm_dir}/dist/cnc-port.js"
