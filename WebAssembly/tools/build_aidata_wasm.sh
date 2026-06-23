#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_aidata.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_aidata_input_ptr
  -Wl,--export=generals_aidata_input_capacity
  -Wl,--export=generals_aidata_parse
  -Wl,--export=generals_aidata_scalar_field_count
  -Wl,--export=generals_aidata_scalar_assignment_count
  -Wl,--export=generals_aidata_scalar_assigned_count
  -Wl,--export=generals_aidata_side_count
  -Wl,--export=generals_aidata_side_field_count
  -Wl,--export=generals_aidata_skill_set_count
  -Wl,--export=generals_aidata_science_count
  -Wl,--export=generals_aidata_build_list_count
  -Wl,--export=generals_aidata_structure_count
  -Wl,--export=generals_aidata_structure_field_count
  -Wl,--export=generals_aidata_auto_build_count
  -Wl,--export=generals_aidata_initially_built_count
  -Wl,--export=generals_aidata_line_count
  -Wl,--export=generals_aidata_error_count
  -Wl,--export=generals_aidata_scalar_name_ptr
  -Wl,--export=generals_aidata_scalar_name_size
  -Wl,--export=generals_aidata_scalar_raw_ptr
  -Wl,--export=generals_aidata_scalar_raw_size
  -Wl,--export=generals_aidata_scalar_value_x100
  -Wl,--export=generals_aidata_scalar_line
  -Wl,--export=generals_aidata_scalar_assigned
  -Wl,--export=generals_aidata_side_name_ptr
  -Wl,--export=generals_aidata_side_name_size
  -Wl,--export=generals_aidata_side_base_defense_ptr
  -Wl,--export=generals_aidata_side_base_defense_size
  -Wl,--export=generals_aidata_side_line
  -Wl,--export=generals_aidata_side_field_count_at
  -Wl,--export=generals_aidata_side_resource_easy
  -Wl,--export=generals_aidata_side_resource_normal
  -Wl,--export=generals_aidata_side_resource_hard
  -Wl,--export=generals_aidata_side_first_skill_set
  -Wl,--export=generals_aidata_side_skill_set_count
  -Wl,--export=generals_aidata_skill_set_side_index
  -Wl,--export=generals_aidata_skill_set_slot
  -Wl,--export=generals_aidata_skill_set_line
  -Wl,--export=generals_aidata_skill_set_first_science
  -Wl,--export=generals_aidata_skill_set_science_count
  -Wl,--export=generals_aidata_science_skill_set_index
  -Wl,--export=generals_aidata_science_name_ptr
  -Wl,--export=generals_aidata_science_name_size
  -Wl,--export=generals_aidata_science_line
  -Wl,--export=generals_aidata_build_list_side_ptr
  -Wl,--export=generals_aidata_build_list_side_size
  -Wl,--export=generals_aidata_build_list_line
  -Wl,--export=generals_aidata_build_list_first_structure
  -Wl,--export=generals_aidata_build_list_structure_count
  -Wl,--export=generals_aidata_structure_build_list_index
  -Wl,--export=generals_aidata_structure_template_ptr
  -Wl,--export=generals_aidata_structure_template_size
  -Wl,--export=generals_aidata_structure_name_ptr
  -Wl,--export=generals_aidata_structure_name_size
  -Wl,--export=generals_aidata_structure_line
  -Wl,--export=generals_aidata_structure_field_count_at
  -Wl,--export=generals_aidata_structure_x_x100
  -Wl,--export=generals_aidata_structure_y_x100
  -Wl,--export=generals_aidata_structure_rally_x_x100
  -Wl,--export=generals_aidata_structure_rally_y_x100
  -Wl,--export=generals_aidata_structure_rebuilds
  -Wl,--export=generals_aidata_structure_angle_x100
  -Wl,--export=generals_aidata_structure_initially_built
  -Wl,--export=generals_aidata_structure_automatically_build
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
    "${wasm_dir}/src/aidata_module.cpp" \
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
    "${wasm_dir}/src/aidata_module.cpp" \
    -o "${out_file}"
fi

echo "Built ${out_file}"
