#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_particle.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_particle_input_ptr
  -Wl,--export=generals_particle_input_capacity
  -Wl,--export=generals_particle_parse
  -Wl,--export=generals_particle_template_count
  -Wl,--export=generals_particle_field_count
  -Wl,--export=generals_particle_line_count
  -Wl,--export=generals_particle_error_count
  -Wl,--export=generals_particle_shader_count
  -Wl,--export=generals_particle_type_count
  -Wl,--export=generals_particle_priority_count
  -Wl,--export=generals_particle_velocity_count
  -Wl,--export=generals_particle_volume_count
  -Wl,--export=generals_particle_shader_name_ptr
  -Wl,--export=generals_particle_shader_name_size
  -Wl,--export=generals_particle_type_name_ptr
  -Wl,--export=generals_particle_type_name_size
  -Wl,--export=generals_particle_priority_name_ptr
  -Wl,--export=generals_particle_priority_name_size
  -Wl,--export=generals_particle_velocity_name_ptr
  -Wl,--export=generals_particle_velocity_name_size
  -Wl,--export=generals_particle_volume_name_ptr
  -Wl,--export=generals_particle_volume_name_size
  -Wl,--export=generals_particle_template_name_ptr
  -Wl,--export=generals_particle_template_name_size
  -Wl,--export=generals_particle_template_particle_name_ptr
  -Wl,--export=generals_particle_template_particle_name_size
  -Wl,--export=generals_particle_template_slave_system_ptr
  -Wl,--export=generals_particle_template_slave_system_size
  -Wl,--export=generals_particle_template_attached_system_ptr
  -Wl,--export=generals_particle_template_attached_system_size
  -Wl,--export=generals_particle_template_line
  -Wl,--export=generals_particle_template_field_count_at
  -Wl,--export=generals_particle_template_priority
  -Wl,--export=generals_particle_template_shader
  -Wl,--export=generals_particle_template_type
  -Wl,--export=generals_particle_template_velocity_type
  -Wl,--export=generals_particle_template_volume_type
  -Wl,--export=generals_particle_template_is_one_shot
  -Wl,--export=generals_particle_template_system_lifetime
  -Wl,--export=generals_particle_template_lifetime_low_x100
  -Wl,--export=generals_particle_template_lifetime_high_x100
  -Wl,--export=generals_particle_template_size_low_x100
  -Wl,--export=generals_particle_template_size_high_x100
  -Wl,--export=generals_particle_template_burst_delay_low_x100
  -Wl,--export=generals_particle_template_burst_delay_high_x100
  -Wl,--export=generals_particle_template_burst_count_low_x100
  -Wl,--export=generals_particle_template_burst_count_high_x100
  -Wl,--export=generals_particle_template_initial_delay_low_x100
  -Wl,--export=generals_particle_template_initial_delay_high_x100
  -Wl,--export=generals_particle_template_gravity_x100
  -Wl,--export=generals_particle_template_volume_radius_x100
  -Wl,--export=generals_particle_template_volume_length_x100
  -Wl,--export=generals_particle_template_is_hollow
  -Wl,--export=generals_particle_template_is_ground_aligned
  -Wl,--export=generals_particle_template_is_emit_above_ground_only
  -Wl,--export=generals_particle_template_is_particle_up_towards_emitter
)

if command -v em++ >/dev/null 2>&1 && [[ "${GENERALS_WASM_FORCE_RAW_CLANG:-0}" != "1" ]]; then
  em++ \
    -std=c++17 \
    -O2 \
    -fno-exceptions \
    -fno-rtti \
    --no-entry \
    -sSTANDALONE_WASM=1 \
    -sINITIAL_MEMORY=33554432 \
    "${exports[@]}" \
    "${wasm_dir}/src/particle_module.cpp" \
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
    -Wl,--initial-memory=33554432 \
    -Wl,--max-memory=33554432 \
    "${wasm_dir}/src/particle_module.cpp" \
    -o "${out_file}"
fi

echo "Built ${out_file}"
