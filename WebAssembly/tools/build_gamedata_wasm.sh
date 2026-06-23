#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_gamedata.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_gamedata_input_ptr
  -Wl,--export=generals_gamedata_input_capacity
  -Wl,--export=generals_gamedata_parse
  -Wl,--export=generals_gamedata_block_count
  -Wl,--export=generals_gamedata_field_count
  -Wl,--export=generals_gamedata_line_count
  -Wl,--export=generals_gamedata_error_count
  -Wl,--export=generals_gamedata_weapon_bonus_count
  -Wl,--export=generals_gamedata_standard_public_bone_count
  -Wl,--export=generals_gamedata_vertex_water_count
  -Wl,--export=generals_gamedata_shell_map_name_ptr
  -Wl,--export=generals_gamedata_shell_map_name_size
  -Wl,--export=generals_gamedata_map_name_ptr
  -Wl,--export=generals_gamedata_map_name_size
  -Wl,--export=generals_gamedata_move_hint_name_ptr
  -Wl,--export=generals_gamedata_move_hint_name_size
  -Wl,--export=generals_gamedata_terrain_lod_ptr
  -Wl,--export=generals_gamedata_terrain_lod_size
  -Wl,--export=generals_gamedata_time_of_day_ptr
  -Wl,--export=generals_gamedata_time_of_day_size
  -Wl,--export=generals_gamedata_weather_ptr
  -Wl,--export=generals_gamedata_weather_size
  -Wl,--export=generals_gamedata_special_power_view_object_ptr
  -Wl,--export=generals_gamedata_special_power_view_object_size
  -Wl,--export=generals_gamedata_auto_fire_particle_small_prefix_ptr
  -Wl,--export=generals_gamedata_auto_fire_particle_small_prefix_size
  -Wl,--export=generals_gamedata_auto_fire_particle_small_system_ptr
  -Wl,--export=generals_gamedata_auto_fire_particle_small_system_size
  -Wl,--export=generals_gamedata_auto_smoke_particle_large_system_ptr
  -Wl,--export=generals_gamedata_auto_smoke_particle_large_system_size
  -Wl,--export=generals_gamedata_use_trees
  -Wl,--export=generals_gamedata_use_fps_limit
  -Wl,--export=generals_gamedata_frames_per_second_limit
  -Wl,--export=generals_gamedata_max_shell_screens
  -Wl,--export=generals_gamedata_use_cloud_map
  -Wl,--export=generals_gamedata_use_water_plane
  -Wl,--export=generals_gamedata_show_object_health
  -Wl,--export=generals_gamedata_use_three_way_terrain_blends
  -Wl,--export=generals_gamedata_draw_sky_box
  -Wl,--export=generals_gamedata_audio_on
  -Wl,--export=generals_gamedata_music_on
  -Wl,--export=generals_gamedata_sounds_on
  -Wl,--export=generals_gamedata_speech_on
  -Wl,--export=generals_gamedata_video_on
  -Wl,--export=generals_gamedata_value_per_supply_box
  -Wl,--export=generals_gamedata_max_particle_count
  -Wl,--export=generals_gamedata_max_field_particle_count
  -Wl,--export=generals_gamedata_max_line_build_objects
  -Wl,--export=generals_gamedata_max_tunnel_capacity
  -Wl,--export=generals_gamedata_default_starting_cash
  -Wl,--export=generals_gamedata_clear_alpha
  -Wl,--export=generals_gamedata_fog_alpha
  -Wl,--export=generals_gamedata_shroud_alpha
  -Wl,--export=generals_gamedata_shroud_color_r
  -Wl,--export=generals_gamedata_shroud_color_g
  -Wl,--export=generals_gamedata_shroud_color_b
  -Wl,--export=generals_gamedata_network_keep_alive_delay
  -Wl,--export=generals_gamedata_network_disconnect_time
  -Wl,--export=generals_gamedata_network_player_timeout_time
  -Wl,--export=generals_gamedata_water_position_z_x100
  -Wl,--export=generals_gamedata_water_extent_x_x100
  -Wl,--export=generals_gamedata_water_extent_y_x100
  -Wl,--export=generals_gamedata_camera_pitch_x100
  -Wl,--export=generals_gamedata_camera_yaw_x100
  -Wl,--export=generals_gamedata_camera_height_x100
  -Wl,--export=generals_gamedata_max_camera_height_x100
  -Wl,--export=generals_gamedata_min_camera_height_x100
  -Wl,--export=generals_gamedata_scroll_amount_cutoff_x100
  -Wl,--export=generals_gamedata_particle_scale_x100
  -Wl,--export=generals_gamedata_build_speed_x100
  -Wl,--export=generals_gamedata_refund_percent_x100
  -Wl,--export=generals_gamedata_sell_percentage_x100
  -Wl,--export=generals_gamedata_keyboard_camera_rotate_speed_x100
  -Wl,--export=generals_gamedata_weapon_bonus_bonus_ptr
  -Wl,--export=generals_gamedata_weapon_bonus_bonus_size
  -Wl,--export=generals_gamedata_weapon_bonus_field_ptr
  -Wl,--export=generals_gamedata_weapon_bonus_field_size
  -Wl,--export=generals_gamedata_weapon_bonus_percent_x100
  -Wl,--export=generals_gamedata_weapon_bonus_line
  -Wl,--export=generals_gamedata_standard_public_bone_name_ptr
  -Wl,--export=generals_gamedata_standard_public_bone_name_size
  -Wl,--export=generals_gamedata_standard_public_bone_line
  -Wl,--export=generals_gamedata_vertex_water_map_ptr
  -Wl,--export=generals_gamedata_vertex_water_map_size
  -Wl,--export=generals_gamedata_vertex_water_line
  -Wl,--export=generals_gamedata_vertex_water_angle_x100
  -Wl,--export=generals_gamedata_vertex_water_x_position_x100
  -Wl,--export=generals_gamedata_vertex_water_y_position_x100
  -Wl,--export=generals_gamedata_vertex_water_z_position_x100
  -Wl,--export=generals_gamedata_vertex_water_x_grid_cells
  -Wl,--export=generals_gamedata_vertex_water_y_grid_cells
  -Wl,--export=generals_gamedata_vertex_water_grid_size_x100
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
    "${wasm_dir}/src/gamedata_module.cpp" \
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
    "${wasm_dir}/src/gamedata_module.cpp" \
    -o "${out_file}"
fi

echo "Built ${out_file}"
