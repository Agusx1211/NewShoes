#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_locomotor.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_locomotor_input_ptr
  -Wl,--export=generals_locomotor_input_capacity
  -Wl,--export=generals_locomotor_parse
  -Wl,--export=generals_locomotor_template_count
  -Wl,--export=generals_locomotor_field_count
  -Wl,--export=generals_locomotor_line_count
  -Wl,--export=generals_locomotor_error_count
  -Wl,--export=generals_locomotor_ground_template_count
  -Wl,--export=generals_locomotor_air_template_count
  -Wl,--export=generals_locomotor_water_template_count
  -Wl,--export=generals_locomotor_cliff_template_count
  -Wl,--export=generals_locomotor_surface_name_ptr
  -Wl,--export=generals_locomotor_surface_name_size
  -Wl,--export=generals_locomotor_behavior_z_name_ptr
  -Wl,--export=generals_locomotor_behavior_z_name_size
  -Wl,--export=generals_locomotor_appearance_name_ptr
  -Wl,--export=generals_locomotor_appearance_name_size
  -Wl,--export=generals_locomotor_priority_name_ptr
  -Wl,--export=generals_locomotor_priority_name_size
  -Wl,--export=generals_locomotor_template_name_ptr
  -Wl,--export=generals_locomotor_template_name_size
  -Wl,--export=generals_locomotor_template_surfaces_ptr
  -Wl,--export=generals_locomotor_template_surfaces_size
  -Wl,--export=generals_locomotor_template_line
  -Wl,--export=generals_locomotor_template_field_count
  -Wl,--export=generals_locomotor_template_surfaces_mask
  -Wl,--export=generals_locomotor_template_behavior_z
  -Wl,--export=generals_locomotor_template_appearance
  -Wl,--export=generals_locomotor_template_move_priority
  -Wl,--export=generals_locomotor_template_speed_x100
  -Wl,--export=generals_locomotor_template_speed_damaged_x100
  -Wl,--export=generals_locomotor_template_turn_rate_x100
  -Wl,--export=generals_locomotor_template_turn_rate_damaged_x100
  -Wl,--export=generals_locomotor_template_acceleration_x100
  -Wl,--export=generals_locomotor_template_acceleration_damaged_x100
  -Wl,--export=generals_locomotor_template_lift_x100
  -Wl,--export=generals_locomotor_template_lift_damaged_x100
  -Wl,--export=generals_locomotor_template_braking_x100
  -Wl,--export=generals_locomotor_template_min_speed_x100
  -Wl,--export=generals_locomotor_template_min_turn_speed_x100
  -Wl,--export=generals_locomotor_template_preferred_height_x100
  -Wl,--export=generals_locomotor_template_preferred_height_damping_x100
  -Wl,--export=generals_locomotor_template_circling_radius_x100
  -Wl,--export=generals_locomotor_template_extra_2d_friction_x100
  -Wl,--export=generals_locomotor_template_speed_limit_z_x100
  -Wl,--export=generals_locomotor_template_max_thrust_angle_x100
  -Wl,--export=generals_locomotor_template_close_enough_dist_x100
  -Wl,--export=generals_locomotor_template_slide_into_place_time_x100
  -Wl,--export=generals_locomotor_template_airborne_targeting_height
  -Wl,--export=generals_locomotor_template_apply_2d_friction_when_airborne
  -Wl,--export=generals_locomotor_template_downhill_only
  -Wl,--export=generals_locomotor_template_allow_airborne_motive_force
  -Wl,--export=generals_locomotor_template_locomotor_works_when_dead
  -Wl,--export=generals_locomotor_template_stick_to_ground
  -Wl,--export=generals_locomotor_template_can_move_backwards
  -Wl,--export=generals_locomotor_template_has_suspension
  -Wl,--export=generals_locomotor_template_close_enough_dist_3d
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
    "${wasm_dir}/src/locomotor_module.cpp" \
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
    "${wasm_dir}/src/locomotor_module.cpp" \
    -o "${out_file}"
fi

echo "Built ${out_file}"
