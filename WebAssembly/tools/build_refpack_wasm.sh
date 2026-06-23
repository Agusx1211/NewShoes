#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
repo_root="$(cd "${wasm_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_refpack.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_refpack_input_ptr
  -Wl,--export=generals_refpack_output_ptr
  -Wl,--export=generals_refpack_input_capacity
  -Wl,--export=generals_refpack_output_capacity
  -Wl,--export=generals_refpack_last_consumed_size
  -Wl,--export=generals_refpack_is
  -Wl,--export=generals_refpack_size
  -Wl,--export=generals_refpack_decode
)

if command -v em++ >/dev/null 2>&1 && [[ "${GENERALS_WASM_FORCE_RAW_CLANG:-0}" != "1" ]]; then
  em++ \
    -std=c++17 \
    -O2 \
    -fno-exceptions \
    -fno-rtti \
    -I "${repo_root}/Generals/Code/Libraries/Source/Compression/EAC" \
    --no-entry \
    -sSTANDALONE_WASM=1 \
    -sINITIAL_MEMORY=16777216 \
    "${exports[@]}" \
    "${wasm_dir}/src/refpack_module.cpp" \
    -o "${out_file}"
else
  compiler="${CXX:-clang++}"

  if ! command -v "${compiler}" >/dev/null 2>&1; then
    echo "C++ compiler not found: ${compiler}" >&2
    exit 1
  fi

  "${compiler}" \
    --target=wasm32-unknown-unknown \
    -std=c++17 \
    -O2 \
    -fno-exceptions \
    -fno-rtti \
    -nostdlib \
    -I "${wasm_dir}/shims" \
    -I "${repo_root}/Generals/Code/Libraries/Source/Compression/EAC" \
    -Wl,--no-entry \
    -Wl,--export-memory \
    "${exports[@]}" \
    -Wl,--initial-memory=262144 \
    -Wl,--max-memory=262144 \
    "${wasm_dir}/src/refpack_module.cpp" \
    -o "${out_file}"
fi

echo "Built ${out_file}"
