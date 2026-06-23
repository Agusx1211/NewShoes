#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_weapon.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_weapon_input_ptr
  -Wl,--export=generals_weapon_input_capacity
  -Wl,--export=generals_weapon_parse
  -Wl,--export=generals_weapon_damage_type_count
  -Wl,--export=generals_weapon_damage_type_name_ptr
  -Wl,--export=generals_weapon_damage_type_name_size
  -Wl,--export=generals_weapon_template_count
  -Wl,--export=generals_weapon_field_count
  -Wl,--export=generals_weapon_line_count
  -Wl,--export=generals_weapon_error_count
  -Wl,--export=generals_weapon_template_name_ptr
  -Wl,--export=generals_weapon_template_name_size
  -Wl,--export=generals_weapon_template_line
  -Wl,--export=generals_weapon_template_field_count
  -Wl,--export=generals_weapon_template_primary_damage_x100
  -Wl,--export=generals_weapon_template_primary_damage_radius_x100
  -Wl,--export=generals_weapon_template_secondary_damage_x100
  -Wl,--export=generals_weapon_template_secondary_damage_radius_x100
  -Wl,--export=generals_weapon_template_attack_range_x100
  -Wl,--export=generals_weapon_template_minimum_attack_range_x100
  -Wl,--export=generals_weapon_template_weapon_speed_x100
  -Wl,--export=generals_weapon_template_damage_type
  -Wl,--export=generals_weapon_template_clip_size
  -Wl,--export=generals_weapon_template_clip_reload_time_ms
  -Wl,--export=generals_weapon_template_delay_between_shots_min_ms
  -Wl,--export=generals_weapon_template_delay_between_shots_max_ms
  -Wl,--export=generals_weapon_template_projectile_name_ptr
  -Wl,--export=generals_weapon_template_projectile_name_size
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
    "${wasm_dir}/src/weapon_module.cpp" \
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
    "${wasm_dir}/src/weapon_module.cpp" \
    -o "${out_file}"
fi

echo "Built ${out_file}"
