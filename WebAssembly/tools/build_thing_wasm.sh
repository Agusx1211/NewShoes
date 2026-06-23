#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_thing.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_thing_input_ptr
  -Wl,--export=generals_thing_input_capacity
  -Wl,--export=generals_thing_parse
  -Wl,--export=generals_thing_template_count
  -Wl,--export=generals_thing_field_count
  -Wl,--export=generals_thing_armor_set_count
  -Wl,--export=generals_thing_weapon_set_count
  -Wl,--export=generals_thing_module_count
  -Wl,--export=generals_thing_line_count
  -Wl,--export=generals_thing_error_count
  -Wl,--export=generals_thing_template_name_ptr
  -Wl,--export=generals_thing_template_name_size
  -Wl,--export=generals_thing_template_line
  -Wl,--export=generals_thing_template_field_count
  -Wl,--export=generals_thing_template_display_name_ptr
  -Wl,--export=generals_thing_template_display_name_size
  -Wl,--export=generals_thing_template_side_ptr
  -Wl,--export=generals_thing_template_side_size
  -Wl,--export=generals_thing_template_editor_sorting_ptr
  -Wl,--export=generals_thing_template_editor_sorting_size
  -Wl,--export=generals_thing_template_command_set_ptr
  -Wl,--export=generals_thing_template_command_set_size
  -Wl,--export=generals_thing_template_kind_of_ptr
  -Wl,--export=generals_thing_template_kind_of_size
  -Wl,--export=generals_thing_template_kind_token_count
  -Wl,--export=generals_thing_template_kind_flags
  -Wl,--export=generals_thing_template_build_cost
  -Wl,--export=generals_thing_template_build_time_x100
  -Wl,--export=generals_thing_template_vision_range_x100
  -Wl,--export=generals_thing_template_shroud_clearing_range_x100
  -Wl,--export=generals_thing_template_transport_slot_count
  -Wl,--export=generals_thing_template_module_count
  -Wl,--export=generals_thing_template_first_armor_set
  -Wl,--export=generals_thing_template_armor_set_count
  -Wl,--export=generals_thing_template_first_weapon_set
  -Wl,--export=generals_thing_template_weapon_set_count
  -Wl,--export=generals_thing_armor_set_object_index
  -Wl,--export=generals_thing_armor_set_conditions_ptr
  -Wl,--export=generals_thing_armor_set_conditions_size
  -Wl,--export=generals_thing_armor_set_armor_ptr
  -Wl,--export=generals_thing_armor_set_armor_size
  -Wl,--export=generals_thing_armor_set_damage_fx_ptr
  -Wl,--export=generals_thing_armor_set_damage_fx_size
  -Wl,--export=generals_thing_weapon_set_object_index
  -Wl,--export=generals_thing_weapon_set_conditions_ptr
  -Wl,--export=generals_thing_weapon_set_conditions_size
  -Wl,--export=generals_thing_weapon_set_primary_ptr
  -Wl,--export=generals_thing_weapon_set_primary_size
  -Wl,--export=generals_thing_weapon_set_secondary_ptr
  -Wl,--export=generals_thing_weapon_set_secondary_size
  -Wl,--export=generals_thing_weapon_set_tertiary_ptr
  -Wl,--export=generals_thing_weapon_set_tertiary_size
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
    "${wasm_dir}/src/thing_module.cpp" \
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
    "${wasm_dir}/src/thing_module.cpp" \
    -o "${out_file}"
fi

echo "Built ${out_file}"
