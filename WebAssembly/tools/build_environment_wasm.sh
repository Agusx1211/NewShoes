#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_environment.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_environment_input_ptr
  -Wl,--export=generals_environment_input_capacity
  -Wl,--export=generals_environment_parse
  -Wl,--export=generals_environment_water_set_count
  -Wl,--export=generals_environment_transparency_count
  -Wl,--export=generals_environment_weather_count
  -Wl,--export=generals_environment_field_count
  -Wl,--export=generals_environment_line_count
  -Wl,--export=generals_environment_error_count
  -Wl,--export=generals_environment_water_set_name_ptr
  -Wl,--export=generals_environment_water_set_name_size
  -Wl,--export=generals_environment_water_set_sky_texture_ptr
  -Wl,--export=generals_environment_water_set_sky_texture_size
  -Wl,--export=generals_environment_water_set_water_texture_ptr
  -Wl,--export=generals_environment_water_set_water_texture_size
  -Wl,--export=generals_environment_water_set_line
  -Wl,--export=generals_environment_water_set_field_count_at
  -Wl,--export=generals_environment_water_set_vertex_r
  -Wl,--export=generals_environment_water_set_vertex_g
  -Wl,--export=generals_environment_water_set_vertex_b
  -Wl,--export=generals_environment_water_set_vertex_a
  -Wl,--export=generals_environment_water_set_diffuse_r
  -Wl,--export=generals_environment_water_set_diffuse_g
  -Wl,--export=generals_environment_water_set_diffuse_b
  -Wl,--export=generals_environment_water_set_diffuse_a
  -Wl,--export=generals_environment_water_set_transparent_diffuse_r
  -Wl,--export=generals_environment_water_set_transparent_diffuse_g
  -Wl,--export=generals_environment_water_set_transparent_diffuse_b
  -Wl,--export=generals_environment_water_set_transparent_diffuse_a
  -Wl,--export=generals_environment_water_set_u_scroll_per_ms_x10000
  -Wl,--export=generals_environment_water_set_v_scroll_per_ms_x10000
  -Wl,--export=generals_environment_water_set_sky_texels_per_unit_x10000
  -Wl,--export=generals_environment_water_set_repeat_count
  -Wl,--export=generals_environment_transparency_standing_water_texture_ptr
  -Wl,--export=generals_environment_transparency_standing_water_texture_size
  -Wl,--export=generals_environment_transparency_skybox_texture_ptr
  -Wl,--export=generals_environment_transparency_skybox_texture_size
  -Wl,--export=generals_environment_transparency_line
  -Wl,--export=generals_environment_transparency_field_count_at
  -Wl,--export=generals_environment_transparency_depth_x10000
  -Wl,--export=generals_environment_transparency_min_opacity_x10000
  -Wl,--export=generals_environment_transparency_standing_color_r
  -Wl,--export=generals_environment_transparency_standing_color_g
  -Wl,--export=generals_environment_transparency_standing_color_b
  -Wl,--export=generals_environment_transparency_radar_color_r
  -Wl,--export=generals_environment_transparency_radar_color_g
  -Wl,--export=generals_environment_transparency_radar_color_b
  -Wl,--export=generals_environment_transparency_additive_blending
  -Wl,--export=generals_environment_weather_snow_texture_ptr
  -Wl,--export=generals_environment_weather_snow_texture_size
  -Wl,--export=generals_environment_weather_line
  -Wl,--export=generals_environment_weather_field_count_at
  -Wl,--export=generals_environment_weather_snow_frequency_scale_x_x10000
  -Wl,--export=generals_environment_weather_snow_frequency_scale_y_x10000
  -Wl,--export=generals_environment_weather_snow_amplitude_x10000
  -Wl,--export=generals_environment_weather_snow_point_size_x10000
  -Wl,--export=generals_environment_weather_snow_max_point_size_x10000
  -Wl,--export=generals_environment_weather_snow_min_point_size_x10000
  -Wl,--export=generals_environment_weather_snow_quad_size_x10000
  -Wl,--export=generals_environment_weather_snow_box_dimensions_x10000
  -Wl,--export=generals_environment_weather_snow_box_density_x10000
  -Wl,--export=generals_environment_weather_snow_velocity_x10000
  -Wl,--export=generals_environment_weather_use_point_sprites
  -Wl,--export=generals_environment_weather_snow_enabled
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
    "${wasm_dir}/src/environment_module.cpp" \
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
    "${wasm_dir}/src/environment_module.cpp" \
    -o "${out_file}"
fi

echo "Built ${out_file}"
