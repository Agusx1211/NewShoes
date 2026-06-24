#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_roads.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_roads_bridge_count
  -Wl,--export=generals_roads_bridge_model_name_broken_ptr
  -Wl,--export=generals_roads_bridge_model_name_broken_size
  -Wl,--export=generals_roads_bridge_model_name_damaged_ptr
  -Wl,--export=generals_roads_bridge_model_name_damaged_size
  -Wl,--export=generals_roads_bridge_model_name_ptr
  -Wl,--export=generals_roads_bridge_model_name_size
  -Wl,--export=generals_roads_bridge_scale_x100
  -Wl,--export=generals_roads_count
  -Wl,--export=generals_roads_damaged_to_sound_ptr
  -Wl,--export=generals_roads_damaged_to_sound_size
  -Wl,--export=generals_roads_error_count
  -Wl,--export=generals_roads_field_count
  -Wl,--export=generals_roads_field_count_at
  -Wl,--export=generals_roads_input_capacity
  -Wl,--export=generals_roads_input_ptr
  -Wl,--export=generals_roads_is_bridge
  -Wl,--export=generals_roads_line
  -Wl,--export=generals_roads_line_count
  -Wl,--export=generals_roads_name_ptr
  -Wl,--export=generals_roads_name_size
  -Wl,--export=generals_roads_num_fx_per_type
  -Wl,--export=generals_roads_parse
  -Wl,--export=generals_roads_radar_color_b
  -Wl,--export=generals_roads_radar_color_g
  -Wl,--export=generals_roads_radar_color_r
  -Wl,--export=generals_roads_road_count
  -Wl,--export=generals_roads_road_width_in_texture_x100
  -Wl,--export=generals_roads_road_width_x100
  -Wl,--export=generals_roads_scaffold_object_name_ptr
  -Wl,--export=generals_roads_scaffold_object_name_size
  -Wl,--export=generals_roads_texture_ptr
  -Wl,--export=generals_roads_texture_size
  -Wl,--export=generals_roads_tower_from_left_ptr
  -Wl,--export=generals_roads_tower_from_left_size
  -Wl,--export=generals_roads_transition_effects_height_x100
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
    "${wasm_dir}/src/roads_module.cpp" \
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
    "${wasm_dir}/src/roads_module.cpp" \
    -o "${out_file}"
fi

echo "Built ${out_file}"
