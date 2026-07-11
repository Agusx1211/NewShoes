#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
repo_root="$(cd "${wasm_dir}/.." && pwd)"

export BUILD_TYPE=Release
export CNC_BUILD_DIR=pages-build/wasm-threaded-release
export CNC_DIST_DIR=pages-build/dist-threaded-release
export CNC_PORT_THREADS=1
export CNC_BUILD_TARGETS=cnc-port
export CMAKE_CXX_FLAGS="-O2 -ffile-prefix-map=${repo_root}=."
export WASM_EXCEPTIONS=1

exec bash "${script_dir}/build_wasm.sh"
