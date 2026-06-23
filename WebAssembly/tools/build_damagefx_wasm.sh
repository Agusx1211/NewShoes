#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_damagefx.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_damagefx_input_ptr
  -Wl,--export=generals_damagefx_input_capacity
  -Wl,--export=generals_damagefx_parse
  -Wl,--export=generals_damagefx_template_count
  -Wl,--export=generals_damagefx_assignment_count
  -Wl,--export=generals_damagefx_resolved_update_count
  -Wl,--export=generals_damagefx_amount_cell_count
  -Wl,--export=generals_damagefx_major_fx_cell_count
  -Wl,--export=generals_damagefx_minor_fx_cell_count
  -Wl,--export=generals_damagefx_throttle_cell_count
  -Wl,--export=generals_damagefx_line_count
  -Wl,--export=generals_damagefx_error_count
  -Wl,--export=generals_damagefx_field_type_count
  -Wl,--export=generals_damagefx_veterancy_assignment_count
  -Wl,--export=generals_damagefx_damage_name_ptr
  -Wl,--export=generals_damagefx_damage_name_size
  -Wl,--export=generals_damagefx_veterancy_name_ptr
  -Wl,--export=generals_damagefx_veterancy_name_size
  -Wl,--export=generals_damagefx_field_type_name_ptr
  -Wl,--export=generals_damagefx_field_type_name_size
  -Wl,--export=generals_damagefx_template_name_ptr
  -Wl,--export=generals_damagefx_template_name_size
  -Wl,--export=generals_damagefx_template_line
  -Wl,--export=generals_damagefx_template_first_assignment
  -Wl,--export=generals_damagefx_template_assignment_count
  -Wl,--export=generals_damagefx_assignment_template_index
  -Wl,--export=generals_damagefx_assignment_field_type
  -Wl,--export=generals_damagefx_assignment_veterancy
  -Wl,--export=generals_damagefx_assignment_damage_type
  -Wl,--export=generals_damagefx_assignment_expanded_count
  -Wl,--export=generals_damagefx_assignment_value_x100
  -Wl,--export=generals_damagefx_assignment_line
  -Wl,--export=generals_damagefx_assignment_text_ptr
  -Wl,--export=generals_damagefx_assignment_text_size
  -Wl,--export=generals_damagefx_cell_amount_x100
  -Wl,--export=generals_damagefx_cell_major_fx_ptr
  -Wl,--export=generals_damagefx_cell_major_fx_size
  -Wl,--export=generals_damagefx_cell_minor_fx_ptr
  -Wl,--export=generals_damagefx_cell_minor_fx_size
  -Wl,--export=generals_damagefx_cell_throttle_time
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
    "${wasm_dir}/src/damagefx_module.cpp" \
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
    "${wasm_dir}/src/damagefx_module.cpp" \
    -o "${out_file}"
fi

echo "Built ${out_file}"
