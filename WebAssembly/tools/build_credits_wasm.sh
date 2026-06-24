#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_credits.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_credits_blank_count
  -Wl,--export=generals_credits_error_count
  -Wl,--export=generals_credits_field_count
  -Wl,--export=generals_credits_has_block
  -Wl,--export=generals_credits_input_capacity
  -Wl,--export=generals_credits_input_ptr
  -Wl,--export=generals_credits_line_at
  -Wl,--export=generals_credits_line_count
  -Wl,--export=generals_credits_line_style
  -Wl,--export=generals_credits_line_style_name_ptr
  -Wl,--export=generals_credits_line_style_name_size
  -Wl,--export=generals_credits_line_text_ptr
  -Wl,--export=generals_credits_line_text_size
  -Wl,--export=generals_credits_line_total
  -Wl,--export=generals_credits_line_type
  -Wl,--export=generals_credits_minor_color_a
  -Wl,--export=generals_credits_minor_color_b
  -Wl,--export=generals_credits_minor_color_g
  -Wl,--export=generals_credits_minor_color_r
  -Wl,--export=generals_credits_normal_color_a
  -Wl,--export=generals_credits_normal_color_b
  -Wl,--export=generals_credits_normal_color_g
  -Wl,--export=generals_credits_normal_color_r
  -Wl,--export=generals_credits_parse
  -Wl,--export=generals_credits_scroll_down
  -Wl,--export=generals_credits_scroll_rate
  -Wl,--export=generals_credits_scroll_rate_every_frames
  -Wl,--export=generals_credits_settings_field_count
  -Wl,--export=generals_credits_style_count
  -Wl,--export=generals_credits_style_decl_count
  -Wl,--export=generals_credits_style_name_ptr
  -Wl,--export=generals_credits_style_name_size
  -Wl,--export=generals_credits_text_count
  -Wl,--export=generals_credits_title_color_a
  -Wl,--export=generals_credits_title_color_b
  -Wl,--export=generals_credits_title_color_g
  -Wl,--export=generals_credits_title_color_r
)

if command -v em++ >/dev/null 2>&1 && [[ "${GENERALS_WASM_FORCE_RAW_CLANG:-0}" != "1" ]]; then
  em++ \
    -std=c++17 -O2 -fno-exceptions -fno-rtti --no-entry \
    -sSTANDALONE_WASM=1 -sINITIAL_MEMORY=16777216 \
    "${exports[@]}" \
    "${wasm_dir}/src/credits_module.cpp" -o "${out_file}"
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
    "${wasm_dir}/src/credits_module.cpp" -o "${out_file}"
fi

echo "Built ${out_file}"
