#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_command.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_command_input_ptr
  -Wl,--export=generals_command_input_capacity
  -Wl,--export=generals_command_parse
  -Wl,--export=generals_command_button_count
  -Wl,--export=generals_command_button_field_count
  -Wl,--export=generals_command_set_count
  -Wl,--export=generals_command_set_entry_count
  -Wl,--export=generals_command_line_count
  -Wl,--export=generals_command_error_count
  -Wl,--export=generals_command_button_name_ptr
  -Wl,--export=generals_command_button_name_size
  -Wl,--export=generals_command_button_command_ptr
  -Wl,--export=generals_command_button_command_size
  -Wl,--export=generals_command_button_options_ptr
  -Wl,--export=generals_command_button_options_size
  -Wl,--export=generals_command_button_object_ptr
  -Wl,--export=generals_command_button_object_size
  -Wl,--export=generals_command_button_upgrade_ptr
  -Wl,--export=generals_command_button_upgrade_size
  -Wl,--export=generals_command_button_weapon_slot_ptr
  -Wl,--export=generals_command_button_weapon_slot_size
  -Wl,--export=generals_command_button_science_ptr
  -Wl,--export=generals_command_button_science_size
  -Wl,--export=generals_command_button_special_power_ptr
  -Wl,--export=generals_command_button_special_power_size
  -Wl,--export=generals_command_button_text_label_ptr
  -Wl,--export=generals_command_button_text_label_size
  -Wl,--export=generals_command_button_descript_label_ptr
  -Wl,--export=generals_command_button_descript_label_size
  -Wl,--export=generals_command_button_purchased_label_ptr
  -Wl,--export=generals_command_button_purchased_label_size
  -Wl,--export=generals_command_button_conflicting_label_ptr
  -Wl,--export=generals_command_button_conflicting_label_size
  -Wl,--export=generals_command_button_button_image_ptr
  -Wl,--export=generals_command_button_button_image_size
  -Wl,--export=generals_command_button_cursor_name_ptr
  -Wl,--export=generals_command_button_cursor_name_size
  -Wl,--export=generals_command_button_invalid_cursor_name_ptr
  -Wl,--export=generals_command_button_invalid_cursor_name_size
  -Wl,--export=generals_command_button_button_border_type_ptr
  -Wl,--export=generals_command_button_button_border_type_size
  -Wl,--export=generals_command_button_radius_cursor_type_ptr
  -Wl,--export=generals_command_button_radius_cursor_type_size
  -Wl,--export=generals_command_button_unit_specific_sound_ptr
  -Wl,--export=generals_command_button_unit_specific_sound_size
  -Wl,--export=generals_command_button_line
  -Wl,--export=generals_command_button_field_count_at
  -Wl,--export=generals_command_button_max_shots_to_fire
  -Wl,--export=generals_command_set_name_ptr
  -Wl,--export=generals_command_set_name_size
  -Wl,--export=generals_command_set_line
  -Wl,--export=generals_command_set_entry_count_at
  -Wl,--export=generals_command_set_first_entry
  -Wl,--export=generals_command_set_entry_set_index
  -Wl,--export=generals_command_set_entry_slot
  -Wl,--export=generals_command_set_entry_button_ptr
  -Wl,--export=generals_command_set_entry_button_size
  -Wl,--export=generals_command_set_entry_line
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
    "${wasm_dir}/src/command_module.cpp" \
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
    "${wasm_dir}/src/command_module.cpp" \
    -o "${out_file}"
fi

echo "Built ${out_file}"
