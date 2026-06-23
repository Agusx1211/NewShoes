#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_player.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_player_input_ptr
  -Wl,--export=generals_player_input_capacity
  -Wl,--export=generals_player_parse
  -Wl,--export=generals_player_template_count
  -Wl,--export=generals_player_field_count
  -Wl,--export=generals_player_playable_count
  -Wl,--export=generals_player_observer_count
  -Wl,--export=generals_player_old_faction_count
  -Wl,--export=generals_player_intrinsic_science_count
  -Wl,--export=generals_player_purchase_science_command_set_count
  -Wl,--export=generals_player_line_count
  -Wl,--export=generals_player_error_count
  -Wl,--export=generals_player_template_name_ptr
  -Wl,--export=generals_player_template_name_size
  -Wl,--export=generals_player_template_side_ptr
  -Wl,--export=generals_player_template_side_size
  -Wl,--export=generals_player_template_base_side_ptr
  -Wl,--export=generals_player_template_base_side_size
  -Wl,--export=generals_player_template_display_name_ptr
  -Wl,--export=generals_player_template_display_name_size
  -Wl,--export=generals_player_template_preferred_color_ptr
  -Wl,--export=generals_player_template_preferred_color_size
  -Wl,--export=generals_player_template_starting_building_ptr
  -Wl,--export=generals_player_template_starting_building_size
  -Wl,--export=generals_player_template_starting_unit_ptr
  -Wl,--export=generals_player_template_starting_unit_size
  -Wl,--export=generals_player_template_intrinsic_sciences_ptr
  -Wl,--export=generals_player_template_intrinsic_sciences_size
  -Wl,--export=generals_player_template_purchase_science_command_set_rank1_ptr
  -Wl,--export=generals_player_template_purchase_science_command_set_rank1_size
  -Wl,--export=generals_player_template_purchase_science_command_set_rank3_ptr
  -Wl,--export=generals_player_template_purchase_science_command_set_rank3_size
  -Wl,--export=generals_player_template_purchase_science_command_set_rank8_ptr
  -Wl,--export=generals_player_template_purchase_science_command_set_rank8_size
  -Wl,--export=generals_player_template_special_power_shortcut_command_set_ptr
  -Wl,--export=generals_player_template_special_power_shortcut_command_set_size
  -Wl,--export=generals_player_template_special_power_shortcut_win_name_ptr
  -Wl,--export=generals_player_template_special_power_shortcut_win_name_size
  -Wl,--export=generals_player_template_score_screen_image_ptr
  -Wl,--export=generals_player_template_score_screen_image_size
  -Wl,--export=generals_player_template_load_screen_image_ptr
  -Wl,--export=generals_player_template_load_screen_image_size
  -Wl,--export=generals_player_template_load_screen_music_ptr
  -Wl,--export=generals_player_template_load_screen_music_size
  -Wl,--export=generals_player_template_score_screen_music_ptr
  -Wl,--export=generals_player_template_score_screen_music_size
  -Wl,--export=generals_player_template_head_water_mark_ptr
  -Wl,--export=generals_player_template_head_water_mark_size
  -Wl,--export=generals_player_template_flag_water_mark_ptr
  -Wl,--export=generals_player_template_flag_water_mark_size
  -Wl,--export=generals_player_template_enabled_image_ptr
  -Wl,--export=generals_player_template_enabled_image_size
  -Wl,--export=generals_player_template_side_icon_image_ptr
  -Wl,--export=generals_player_template_side_icon_image_size
  -Wl,--export=generals_player_template_general_image_ptr
  -Wl,--export=generals_player_template_general_image_size
  -Wl,--export=generals_player_template_beacon_name_ptr
  -Wl,--export=generals_player_template_beacon_name_size
  -Wl,--export=generals_player_template_army_tooltip_ptr
  -Wl,--export=generals_player_template_army_tooltip_size
  -Wl,--export=generals_player_template_features_ptr
  -Wl,--export=generals_player_template_features_size
  -Wl,--export=generals_player_template_medallion_regular_ptr
  -Wl,--export=generals_player_template_medallion_regular_size
  -Wl,--export=generals_player_template_medallion_hilite_ptr
  -Wl,--export=generals_player_template_medallion_hilite_size
  -Wl,--export=generals_player_template_medallion_select_ptr
  -Wl,--export=generals_player_template_medallion_select_size
  -Wl,--export=generals_player_template_line
  -Wl,--export=generals_player_template_field_count_at
  -Wl,--export=generals_player_template_playable_side
  -Wl,--export=generals_player_template_observer
  -Wl,--export=generals_player_template_old_faction
  -Wl,--export=generals_player_template_start_money
  -Wl,--export=generals_player_template_preferred_color_r
  -Wl,--export=generals_player_template_preferred_color_g
  -Wl,--export=generals_player_template_preferred_color_b
  -Wl,--export=generals_player_template_intrinsic_science_purchase_points
  -Wl,--export=generals_player_template_intrinsic_science_token_count
  -Wl,--export=generals_player_template_purchase_science_command_set_count
  -Wl,--export=generals_player_template_special_power_shortcut_button_count
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
    "${wasm_dir}/src/player_template_module.cpp" \
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
    "${wasm_dir}/src/player_template_module.cpp" \
    -o "${out_file}"
fi

echo "Built ${out_file}"
