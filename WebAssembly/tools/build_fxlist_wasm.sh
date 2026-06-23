#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_fxlist.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_fxlist_input_ptr
  -Wl,--export=generals_fxlist_input_capacity
  -Wl,--export=generals_fxlist_parse
  -Wl,--export=generals_fxlist_list_count
  -Wl,--export=generals_fxlist_nugget_count
  -Wl,--export=generals_fxlist_field_count
  -Wl,--export=generals_fxlist_line_count
  -Wl,--export=generals_fxlist_error_count
  -Wl,--export=generals_fxlist_type_count
  -Wl,--export=generals_fxlist_type_name_ptr
  -Wl,--export=generals_fxlist_type_name_size
  -Wl,--export=generals_fxlist_list_name_ptr
  -Wl,--export=generals_fxlist_list_name_size
  -Wl,--export=generals_fxlist_list_line
  -Wl,--export=generals_fxlist_list_first_nugget
  -Wl,--export=generals_fxlist_list_nugget_count
  -Wl,--export=generals_fxlist_nugget_list_index
  -Wl,--export=generals_fxlist_nugget_type
  -Wl,--export=generals_fxlist_nugget_line
  -Wl,--export=generals_fxlist_nugget_field_count
  -Wl,--export=generals_fxlist_nugget_target_ptr
  -Wl,--export=generals_fxlist_nugget_target_size
  -Wl,--export=generals_fxlist_nugget_secondary_ptr
  -Wl,--export=generals_fxlist_nugget_secondary_size
  -Wl,--export=generals_fxlist_nugget_count_value
  -Wl,--export=generals_fxlist_nugget_radius_x100
)

if command -v em++ >/dev/null 2>&1 && [[ "${GENERALS_WASM_FORCE_RAW_CLANG:-0}" != "1" ]]; then
  em++ \
    -std=c++17 \
    -O2 \
    -fno-exceptions \
    -fno-rtti \
    --no-entry \
    -sSTANDALONE_WASM=1 \
    -sINITIAL_MEMORY=16777216 \
    "${exports[@]}" \
    "${wasm_dir}/src/fxlist_module.cpp" \
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
    -Wl,--no-entry \
    -Wl,--export-memory \
    "${exports[@]}" \
    -Wl,--initial-memory=16777216 \
    -Wl,--max-memory=16777216 \
    "${wasm_dir}/src/fxlist_module.cpp" \
    -o "${out_file}"
fi

echo "Built ${out_file}"
