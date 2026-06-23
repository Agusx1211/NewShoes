#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_controlbar.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_controlbar_input_ptr
  -Wl,--export=generals_controlbar_input_capacity
  -Wl,--export=generals_controlbar_parse
  -Wl,--export=generals_controlbar_parsed_count
  -Wl,--export=generals_controlbar_scheme_count
  -Wl,--export=generals_controlbar_image_part_count
  -Wl,--export=generals_controlbar_animation_count
  -Wl,--export=generals_controlbar_field_count
  -Wl,--export=generals_controlbar_line_count
  -Wl,--export=generals_controlbar_error_count
  -Wl,--export=generals_controlbar_scheme_name_ptr
  -Wl,--export=generals_controlbar_scheme_name_size
  -Wl,--export=generals_controlbar_scheme_side_ptr
  -Wl,--export=generals_controlbar_scheme_side_size
  -Wl,--export=generals_controlbar_scheme_queue_button_image_ptr
  -Wl,--export=generals_controlbar_scheme_queue_button_image_size
  -Wl,--export=generals_controlbar_scheme_right_hud_image_ptr
  -Wl,--export=generals_controlbar_scheme_right_hud_image_size
  -Wl,--export=generals_controlbar_scheme_command_marker_image_ptr
  -Wl,--export=generals_controlbar_scheme_command_marker_image_size
  -Wl,--export=generals_controlbar_scheme_exp_bar_foreground_image_ptr
  -Wl,--export=generals_controlbar_scheme_exp_bar_foreground_image_size
  -Wl,--export=generals_controlbar_scheme_power_purchase_image_ptr
  -Wl,--export=generals_controlbar_scheme_power_purchase_image_size
  -Wl,--export=generals_controlbar_scheme_gen_arrow_image_ptr
  -Wl,--export=generals_controlbar_scheme_gen_arrow_image_size
  -Wl,--export=generals_controlbar_scheme_line
  -Wl,--export=generals_controlbar_scheme_field_count_at
  -Wl,--export=generals_controlbar_scheme_first_image
  -Wl,--export=generals_controlbar_scheme_image_count_at
  -Wl,--export=generals_controlbar_scheme_animation_count_at
  -Wl,--export=generals_controlbar_scheme_screen_creation_res_x
  -Wl,--export=generals_controlbar_scheme_screen_creation_res_y
  -Wl,--export=generals_controlbar_scheme_power_bar_ul_x
  -Wl,--export=generals_controlbar_scheme_power_bar_ul_y
  -Wl,--export=generals_controlbar_scheme_power_bar_lr_x
  -Wl,--export=generals_controlbar_scheme_power_bar_lr_y
  -Wl,--export=generals_controlbar_scheme_money_ul_x
  -Wl,--export=generals_controlbar_scheme_money_ul_y
  -Wl,--export=generals_controlbar_scheme_money_lr_x
  -Wl,--export=generals_controlbar_scheme_money_lr_y
  -Wl,--export=generals_controlbar_scheme_build_up_clock_color_r
  -Wl,--export=generals_controlbar_scheme_build_up_clock_color_g
  -Wl,--export=generals_controlbar_scheme_build_up_clock_color_b
  -Wl,--export=generals_controlbar_scheme_build_up_clock_color_a
  -Wl,--export=generals_controlbar_scheme_command_bar_border_color_r
  -Wl,--export=generals_controlbar_scheme_command_bar_border_color_g
  -Wl,--export=generals_controlbar_scheme_command_bar_border_color_b
  -Wl,--export=generals_controlbar_scheme_command_bar_border_color_a
  -Wl,--export=generals_controlbar_scheme_border_build_color_r
  -Wl,--export=generals_controlbar_scheme_border_build_color_g
  -Wl,--export=generals_controlbar_scheme_border_build_color_b
  -Wl,--export=generals_controlbar_scheme_border_build_color_a
  -Wl,--export=generals_controlbar_scheme_border_action_color_r
  -Wl,--export=generals_controlbar_scheme_border_action_color_g
  -Wl,--export=generals_controlbar_scheme_border_action_color_b
  -Wl,--export=generals_controlbar_scheme_border_action_color_a
  -Wl,--export=generals_controlbar_scheme_border_upgrade_color_r
  -Wl,--export=generals_controlbar_scheme_border_upgrade_color_g
  -Wl,--export=generals_controlbar_scheme_border_upgrade_color_b
  -Wl,--export=generals_controlbar_scheme_border_upgrade_color_a
  -Wl,--export=generals_controlbar_scheme_border_system_color_r
  -Wl,--export=generals_controlbar_scheme_border_system_color_g
  -Wl,--export=generals_controlbar_scheme_border_system_color_b
  -Wl,--export=generals_controlbar_scheme_border_system_color_a
  -Wl,--export=generals_controlbar_image_part_name_ptr
  -Wl,--export=generals_controlbar_image_part_name_size
  -Wl,--export=generals_controlbar_image_part_scheme_index
  -Wl,--export=generals_controlbar_image_part_animation_index
  -Wl,--export=generals_controlbar_image_part_position_x
  -Wl,--export=generals_controlbar_image_part_position_y
  -Wl,--export=generals_controlbar_image_part_size_x
  -Wl,--export=generals_controlbar_image_part_size_y
  -Wl,--export=generals_controlbar_image_part_layer
  -Wl,--export=generals_controlbar_image_part_line
  -Wl,--export=generals_controlbar_image_part_field_count_at
  -Wl,--export=generals_controlbar_animation_name_ptr
  -Wl,--export=generals_controlbar_animation_name_size
  -Wl,--export=generals_controlbar_animation_type_ptr
  -Wl,--export=generals_controlbar_animation_type_size
  -Wl,--export=generals_controlbar_animation_scheme_index
  -Wl,--export=generals_controlbar_animation_image_index
  -Wl,--export=generals_controlbar_animation_duration
  -Wl,--export=generals_controlbar_animation_final_pos_x
  -Wl,--export=generals_controlbar_animation_final_pos_y
  -Wl,--export=generals_controlbar_animation_line
  -Wl,--export=generals_controlbar_animation_field_count_at
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
    "${wasm_dir}/src/controlbar_module.cpp" \
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
    "${wasm_dir}/src/controlbar_module.cpp" \
    -o "${out_file}"
fi

echo "Built ${out_file}"
