#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_multiplayer.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_multiplayer_input_ptr
  -Wl,--export=generals_multiplayer_input_capacity
  -Wl,--export=generals_multiplayer_parse
  -Wl,--export=generals_multiplayer_parsed_count
  -Wl,--export=generals_multiplayer_field_count
  -Wl,--export=generals_multiplayer_line_count
  -Wl,--export=generals_multiplayer_error_count
  -Wl,--export=generals_multiplayer_settings_field_count
  -Wl,--export=generals_multiplayer_start_countdown_timer
  -Wl,--export=generals_multiplayer_max_beacons_per_player
  -Wl,--export=generals_multiplayer_use_shroud
  -Wl,--export=generals_multiplayer_show_random_player_template
  -Wl,--export=generals_multiplayer_show_random_start_pos
  -Wl,--export=generals_multiplayer_show_random_color
  -Wl,--export=generals_multiplayer_chat_color_count
  -Wl,--export=generals_multiplayer_chat_color_name_ptr
  -Wl,--export=generals_multiplayer_chat_color_name_size
  -Wl,--export=generals_multiplayer_chat_color_r
  -Wl,--export=generals_multiplayer_chat_color_g
  -Wl,--export=generals_multiplayer_chat_color_b
  -Wl,--export=generals_multiplayer_chat_color_line
  -Wl,--export=generals_multiplayer_color_count
  -Wl,--export=generals_multiplayer_color_name_ptr
  -Wl,--export=generals_multiplayer_color_name_size
  -Wl,--export=generals_multiplayer_color_tooltip_ptr
  -Wl,--export=generals_multiplayer_color_tooltip_size
  -Wl,--export=generals_multiplayer_color_r
  -Wl,--export=generals_multiplayer_color_g
  -Wl,--export=generals_multiplayer_color_b
  -Wl,--export=generals_multiplayer_color_night_r
  -Wl,--export=generals_multiplayer_color_night_g
  -Wl,--export=generals_multiplayer_color_night_b
  -Wl,--export=generals_multiplayer_color_line
  -Wl,--export=generals_multiplayer_color_field_count_at
  -Wl,--export=generals_multiplayer_money_choice_count
  -Wl,--export=generals_multiplayer_money_value
  -Wl,--export=generals_multiplayer_money_is_default
  -Wl,--export=generals_multiplayer_money_line
  -Wl,--export=generals_multiplayer_money_field_count_at
  -Wl,--export=generals_multiplayer_default_starting_money
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
    "${wasm_dir}/src/multiplayer_module.cpp" \
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
    "${wasm_dir}/src/multiplayer_module.cpp" \
    -o "${out_file}"
fi

echo "Built ${out_file}"
