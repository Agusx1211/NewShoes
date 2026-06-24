#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_ingameui.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_ingameui_drawable_caption_bold
  -Wl,--export=generals_ingameui_drawable_caption_font_ptr
  -Wl,--export=generals_ingameui_drawable_caption_font_size
  -Wl,--export=generals_ingameui_drawable_caption_point_size
  -Wl,--export=generals_ingameui_error_count
  -Wl,--export=generals_ingameui_field_count
  -Wl,--export=generals_ingameui_floating_text_time_out
  -Wl,--export=generals_ingameui_has_block
  -Wl,--export=generals_ingameui_input_capacity
  -Wl,--export=generals_ingameui_input_ptr
  -Wl,--export=generals_ingameui_known_field_count
  -Wl,--export=generals_ingameui_line_count
  -Wl,--export=generals_ingameui_max_selection_size
  -Wl,--export=generals_ingameui_message_bold
  -Wl,--export=generals_ingameui_message_color1_b
  -Wl,--export=generals_ingameui_message_color1_g
  -Wl,--export=generals_ingameui_message_color1_r
  -Wl,--export=generals_ingameui_message_color2_b
  -Wl,--export=generals_ingameui_message_color2_g
  -Wl,--export=generals_ingameui_message_color2_r
  -Wl,--export=generals_ingameui_message_delay_ms
  -Wl,--export=generals_ingameui_message_font_ptr
  -Wl,--export=generals_ingameui_message_font_size
  -Wl,--export=generals_ingameui_message_point_size
  -Wl,--export=generals_ingameui_message_pos_x
  -Wl,--export=generals_ingameui_message_pos_y
  -Wl,--export=generals_ingameui_military_color_a
  -Wl,--export=generals_ingameui_military_color_b
  -Wl,--export=generals_ingameui_military_color_g
  -Wl,--export=generals_ingameui_military_color_r
  -Wl,--export=generals_ingameui_named_timer_normal_font_ptr
  -Wl,--export=generals_ingameui_named_timer_normal_font_size
  -Wl,--export=generals_ingameui_named_timer_pos_x1000
  -Wl,--export=generals_ingameui_named_timer_pos_y1000
  -Wl,--export=generals_ingameui_parse
  -Wl,--export=generals_ingameui_radius_cursor_count
  -Wl,--export=generals_ingameui_radius_cursor_name_ptr
  -Wl,--export=generals_ingameui_radius_cursor_name_size
  -Wl,--export=generals_ingameui_radius_cursor_style_ptr
  -Wl,--export=generals_ingameui_radius_cursor_style_size
  -Wl,--export=generals_ingameui_radius_cursor_texture_ptr
  -Wl,--export=generals_ingameui_radius_cursor_texture_size
  -Wl,--export=generals_ingameui_stored_radius_cursor_count
  -Wl,--export=generals_ingameui_superweapon_normal_font_ptr
  -Wl,--export=generals_ingameui_superweapon_normal_font_size
  -Wl,--export=generals_ingameui_superweapon_pos_x1000
  -Wl,--export=generals_ingameui_superweapon_pos_y1000
  -Wl,--export=generals_ingameui_superweapon_ready_bold
)

if command -v em++ >/dev/null 2>&1 && [[ "${GENERALS_WASM_FORCE_RAW_CLANG:-0}" != "1" ]]; then
  em++ \
    -std=c++17 -O2 -fno-exceptions -fno-rtti --no-entry \
    -sSTANDALONE_WASM=1 -sINITIAL_MEMORY=16777216 \
    "${exports[@]}" \
    "${wasm_dir}/src/ingameui_module.cpp" -o "${out_file}"
else
  compiler="${CXX:-clang++}"
  if ! command -v "${compiler}" >/dev/null 2>&1; then
    echo "C++ compiler not found: ${compiler}" >&2
    exit 1
  fi
  "${compiler}" \
    --target=wasm32-unknown-unknown -std=c++17 -O2 -fno-exceptions -fno-rtti -nostdlib \
    -Wl,--no-entry -Wl,--export-memory "${exports[@]}" \
    -Wl,--initial-memory=16777216 -Wl,--max-memory=16777216 \
    "${wasm_dir}/src/ingameui_module.cpp" -o "${out_file}"
fi

echo "Built ${out_file}"
