#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_gamelod.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_gamelod_input_ptr
  -Wl,--export=generals_gamelod_input_capacity
  -Wl,--export=generals_gamelod_parse
  -Wl,--export=generals_gamelod_parsed_count
  -Wl,--export=generals_gamelod_field_count
  -Wl,--export=generals_gamelod_line_count
  -Wl,--export=generals_gamelod_error_count
  -Wl,--export=generals_gamelod_static_count
  -Wl,--export=generals_gamelod_dynamic_count
  -Wl,--export=generals_gamelod_static_name_ptr
  -Wl,--export=generals_gamelod_static_name_size
  -Wl,--export=generals_gamelod_static_line
  -Wl,--export=generals_gamelod_static_field_count_at
  -Wl,--export=generals_gamelod_static_minimum_fps
  -Wl,--export=generals_gamelod_static_minimum_processor_fps
  -Wl,--export=generals_gamelod_static_sample_count_2d
  -Wl,--export=generals_gamelod_static_sample_count_3d
  -Wl,--export=generals_gamelod_static_stream_count
  -Wl,--export=generals_gamelod_static_max_particle_count
  -Wl,--export=generals_gamelod_static_use_shadow_volumes
  -Wl,--export=generals_gamelod_static_use_shadow_decals
  -Wl,--export=generals_gamelod_static_use_cloud_map
  -Wl,--export=generals_gamelod_static_use_light_map
  -Wl,--export=generals_gamelod_static_show_soft_water_edge
  -Wl,--export=generals_gamelod_static_max_tank_track_edges
  -Wl,--export=generals_gamelod_static_max_tank_track_opaque_edges
  -Wl,--export=generals_gamelod_static_max_tank_track_fade_delay
  -Wl,--export=generals_gamelod_static_use_buildup_scaffolds
  -Wl,--export=generals_gamelod_static_use_tree_sway
  -Wl,--export=generals_gamelod_static_use_emissive_night_materials
  -Wl,--export=generals_gamelod_static_use_heat_effects
  -Wl,--export=generals_gamelod_static_texture_reduction_factor
  -Wl,--export=generals_gamelod_dynamic_name_ptr
  -Wl,--export=generals_gamelod_dynamic_name_size
  -Wl,--export=generals_gamelod_dynamic_min_particle_priority_ptr
  -Wl,--export=generals_gamelod_dynamic_min_particle_priority_size
  -Wl,--export=generals_gamelod_dynamic_min_particle_skip_priority_ptr
  -Wl,--export=generals_gamelod_dynamic_min_particle_skip_priority_size
  -Wl,--export=generals_gamelod_dynamic_line
  -Wl,--export=generals_gamelod_dynamic_field_count_at
  -Wl,--export=generals_gamelod_dynamic_minimum_fps
  -Wl,--export=generals_gamelod_dynamic_particle_skip_mask
  -Wl,--export=generals_gamelod_dynamic_debris_skip_mask
  -Wl,--export=generals_gamelod_dynamic_slow_death_scale_x100
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
    "${wasm_dir}/src/gamelod_module.cpp" \
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
    "${wasm_dir}/src/gamelod_module.cpp" \
    -o "${out_file}"
fi

echo "Built ${out_file}"
