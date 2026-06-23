#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_crate.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_crate_input_ptr
  -Wl,--export=generals_crate_input_capacity
  -Wl,--export=generals_crate_parse
  -Wl,--export=generals_crate_template_count
  -Wl,--export=generals_crate_object_count
  -Wl,--export=generals_crate_field_count
  -Wl,--export=generals_crate_owned_by_maker_count
  -Wl,--export=generals_crate_veterancy_condition_count
  -Wl,--export=generals_crate_kindof_condition_count
  -Wl,--export=generals_crate_science_condition_count
  -Wl,--export=generals_crate_line_count
  -Wl,--export=generals_crate_error_count
  -Wl,--export=generals_crate_veterancy_name_ptr
  -Wl,--export=generals_crate_veterancy_name_size
  -Wl,--export=generals_crate_template_name_ptr
  -Wl,--export=generals_crate_template_name_size
  -Wl,--export=generals_crate_template_line
  -Wl,--export=generals_crate_template_field_count_at
  -Wl,--export=generals_crate_template_creation_chance_x100
  -Wl,--export=generals_crate_template_veterancy_level
  -Wl,--export=generals_crate_template_killed_by_type_ptr
  -Wl,--export=generals_crate_template_killed_by_type_size
  -Wl,--export=generals_crate_template_killer_science_ptr
  -Wl,--export=generals_crate_template_killer_science_size
  -Wl,--export=generals_crate_template_owned_by_maker
  -Wl,--export=generals_crate_template_first_object
  -Wl,--export=generals_crate_template_object_count
  -Wl,--export=generals_crate_object_template_index
  -Wl,--export=generals_crate_object_name_ptr
  -Wl,--export=generals_crate_object_name_size
  -Wl,--export=generals_crate_object_chance_x100
  -Wl,--export=generals_crate_object_line
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
    "${wasm_dir}/src/crate_module.cpp" \
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
    "${wasm_dir}/src/crate_module.cpp" \
    -o "${out_file}"
fi

echo "Built ${out_file}"
