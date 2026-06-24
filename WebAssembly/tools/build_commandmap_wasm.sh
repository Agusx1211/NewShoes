#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_commandmap.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_commandmap_category_ptr
  -Wl,--export=generals_commandmap_category_size
  -Wl,--export=generals_commandmap_count
  -Wl,--export=generals_commandmap_description_ptr
  -Wl,--export=generals_commandmap_description_size
  -Wl,--export=generals_commandmap_display_name_ptr
  -Wl,--export=generals_commandmap_display_name_size
  -Wl,--export=generals_commandmap_error_count
  -Wl,--export=generals_commandmap_field_count
  -Wl,--export=generals_commandmap_field_count_at
  -Wl,--export=generals_commandmap_input_capacity
  -Wl,--export=generals_commandmap_input_ptr
  -Wl,--export=generals_commandmap_key_ptr
  -Wl,--export=generals_commandmap_key_size
  -Wl,--export=generals_commandmap_line
  -Wl,--export=generals_commandmap_line_count
  -Wl,--export=generals_commandmap_modifiers_ptr
  -Wl,--export=generals_commandmap_modifiers_size
  -Wl,--export=generals_commandmap_name_ptr
  -Wl,--export=generals_commandmap_name_size
  -Wl,--export=generals_commandmap_parse
  -Wl,--export=generals_commandmap_transition_ptr
  -Wl,--export=generals_commandmap_transition_size
  -Wl,--export=generals_commandmap_useable_in_ptr
  -Wl,--export=generals_commandmap_useable_in_size
)

if command -v em++ >/dev/null 2>&1 && [[ "${GENERALS_WASM_FORCE_RAW_CLANG:-0}" != "1" ]]; then
  em++ \
    -std=c++17 -O2 -fno-exceptions -fno-rtti --no-entry \
    -sSTANDALONE_WASM=1 -sINITIAL_MEMORY=16777216 \
    "${exports[@]}" \
    "${wasm_dir}/src/commandmap_module.cpp" -o "${out_file}"
else
  compiler="${CXX:-clang++}"
  if ! command -v "${compiler}" >/dev/null 2>&1; then
    echo "C++ compiler not found: ${compiler}" >&2
    exit 1
  fi
  "${compiler}" \
    --target=wasm32-unknown-unknown -std=c++17 -O2 -fno-exceptions -fno-rtti -nostdlib \
    -Wl,--no-entry -Wl,--export-memory "${exports[@]}" \
    -Wl,--initial-memory=16777216 -Wl,--max-memory=16777216 \
    "${wasm_dir}/src/commandmap_module.cpp" -o "${out_file}"
fi

echo "Built ${out_file}"
