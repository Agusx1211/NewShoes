#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_progression.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_progression_input_ptr
  -Wl,--export=generals_progression_input_capacity
  -Wl,--export=generals_progression_parse
  -Wl,--export=generals_progression_upgrade_count
  -Wl,--export=generals_progression_upgrade_field_count
  -Wl,--export=generals_progression_special_power_count
  -Wl,--export=generals_progression_special_power_field_count
  -Wl,--export=generals_progression_science_count
  -Wl,--export=generals_progression_science_field_count
  -Wl,--export=generals_progression_line_count
  -Wl,--export=generals_progression_error_count
  -Wl,--export=generals_progression_upgrade_name_ptr
  -Wl,--export=generals_progression_upgrade_name_size
  -Wl,--export=generals_progression_upgrade_display_name_ptr
  -Wl,--export=generals_progression_upgrade_display_name_size
  -Wl,--export=generals_progression_upgrade_type_ptr
  -Wl,--export=generals_progression_upgrade_type_size
  -Wl,--export=generals_progression_upgrade_button_image_ptr
  -Wl,--export=generals_progression_upgrade_button_image_size
  -Wl,--export=generals_progression_upgrade_research_sound_ptr
  -Wl,--export=generals_progression_upgrade_research_sound_size
  -Wl,--export=generals_progression_upgrade_unit_specific_sound_ptr
  -Wl,--export=generals_progression_upgrade_unit_specific_sound_size
  -Wl,--export=generals_progression_upgrade_academy_ptr
  -Wl,--export=generals_progression_upgrade_academy_size
  -Wl,--export=generals_progression_upgrade_line
  -Wl,--export=generals_progression_upgrade_field_count_at
  -Wl,--export=generals_progression_upgrade_build_time_x100
  -Wl,--export=generals_progression_upgrade_build_cost
  -Wl,--export=generals_progression_special_power_name_ptr
  -Wl,--export=generals_progression_special_power_name_size
  -Wl,--export=generals_progression_special_power_enum_ptr
  -Wl,--export=generals_progression_special_power_enum_size
  -Wl,--export=generals_progression_special_power_required_science_ptr
  -Wl,--export=generals_progression_special_power_required_science_size
  -Wl,--export=generals_progression_special_power_initiate_sound_ptr
  -Wl,--export=generals_progression_special_power_initiate_sound_size
  -Wl,--export=generals_progression_special_power_initiate_at_location_sound_ptr
  -Wl,--export=generals_progression_special_power_initiate_at_location_sound_size
  -Wl,--export=generals_progression_special_power_academy_ptr
  -Wl,--export=generals_progression_special_power_academy_size
  -Wl,--export=generals_progression_special_power_line
  -Wl,--export=generals_progression_special_power_field_count_at
  -Wl,--export=generals_progression_special_power_reload_time_ms
  -Wl,--export=generals_progression_special_power_public_timer
  -Wl,--export=generals_progression_special_power_detection_time_ms
  -Wl,--export=generals_progression_special_power_shared_synced_timer
  -Wl,--export=generals_progression_special_power_view_object_duration_ms
  -Wl,--export=generals_progression_special_power_view_object_range_x100
  -Wl,--export=generals_progression_special_power_radius_cursor_radius_x100
  -Wl,--export=generals_progression_special_power_shortcut_power
  -Wl,--export=generals_progression_science_name_ptr
  -Wl,--export=generals_progression_science_name_size
  -Wl,--export=generals_progression_science_prerequisite_sciences_ptr
  -Wl,--export=generals_progression_science_prerequisite_sciences_size
  -Wl,--export=generals_progression_science_display_name_ptr
  -Wl,--export=generals_progression_science_display_name_size
  -Wl,--export=generals_progression_science_description_ptr
  -Wl,--export=generals_progression_science_description_size
  -Wl,--export=generals_progression_science_line
  -Wl,--export=generals_progression_science_field_count_at
  -Wl,--export=generals_progression_science_purchase_point_cost
  -Wl,--export=generals_progression_science_is_grantable
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
    "${wasm_dir}/src/progression_module.cpp" \
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
    "${wasm_dir}/src/progression_module.cpp" \
    -o "${out_file}"
fi

echo "Built ${out_file}"
