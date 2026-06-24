#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_mouse.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_mouse_count
  -Wl,--export=generals_mouse_cursor_directions
  -Wl,--export=generals_mouse_cursor_field_count_at
  -Wl,--export=generals_mouse_cursor_fps_x100
  -Wl,--export=generals_mouse_cursor_frames
  -Wl,--export=generals_mouse_cursor_hotspot_x
  -Wl,--export=generals_mouse_cursor_hotspot_y
  -Wl,--export=generals_mouse_cursor_image_ptr
  -Wl,--export=generals_mouse_cursor_image_size
  -Wl,--export=generals_mouse_cursor_line
  -Wl,--export=generals_mouse_cursor_loop
  -Wl,--export=generals_mouse_cursor_mode
  -Wl,--export=generals_mouse_cursor_name_ptr
  -Wl,--export=generals_mouse_cursor_name_size
  -Wl,--export=generals_mouse_cursor_text_color_a
  -Wl,--export=generals_mouse_cursor_text_color_b
  -Wl,--export=generals_mouse_cursor_text_color_g
  -Wl,--export=generals_mouse_cursor_text_color_r
  -Wl,--export=generals_mouse_cursor_text_ptr
  -Wl,--export=generals_mouse_cursor_text_size
  -Wl,--export=generals_mouse_cursor_texture_ptr
  -Wl,--export=generals_mouse_cursor_texture_size
  -Wl,--export=generals_mouse_cursor_w3d_anim_ptr
  -Wl,--export=generals_mouse_cursor_w3d_anim_size
  -Wl,--export=generals_mouse_cursor_w3d_model_ptr
  -Wl,--export=generals_mouse_cursor_w3d_model_size
  -Wl,--export=generals_mouse_cursor_w3d_scale_x100
  -Wl,--export=generals_mouse_drag_tolerance
  -Wl,--export=generals_mouse_drag_tolerance_3d
  -Wl,--export=generals_mouse_drag_tolerance_ms
  -Wl,--export=generals_mouse_error_count
  -Wl,--export=generals_mouse_field_count
  -Wl,--export=generals_mouse_has_settings
  -Wl,--export=generals_mouse_input_capacity
  -Wl,--export=generals_mouse_input_ptr
  -Wl,--export=generals_mouse_line_count
  -Wl,--export=generals_mouse_ortho_camera
  -Wl,--export=generals_mouse_ortho_zoom_x100
  -Wl,--export=generals_mouse_parse
  -Wl,--export=generals_mouse_settings_field_count
  -Wl,--export=generals_mouse_tooltip_delay_time
  -Wl,--export=generals_mouse_tooltip_fill_time
  -Wl,--export=generals_mouse_tooltip_font_is_bold
  -Wl,--export=generals_mouse_tooltip_font_name_ptr
  -Wl,--export=generals_mouse_tooltip_font_name_size
  -Wl,--export=generals_mouse_tooltip_font_size
  -Wl,--export=generals_mouse_tooltip_width
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
    "${wasm_dir}/src/mouse_module.cpp" \
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
    "${wasm_dir}/src/mouse_module.cpp" \
    -o "${out_file}"
fi

echo "Built ${out_file}"
