#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_audio.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_audio_input_ptr
  -Wl,--export=generals_audio_input_capacity
  -Wl,--export=generals_audio_parse
  -Wl,--export=generals_audio_event_count
  -Wl,--export=generals_audio_field_count
  -Wl,--export=generals_audio_line_count
  -Wl,--export=generals_audio_error_count
  -Wl,--export=generals_audio_sound_reference_count
  -Wl,--export=generals_audio_category_count
  -Wl,--export=generals_audio_priority_count
  -Wl,--export=generals_audio_type_flag_count
  -Wl,--export=generals_audio_control_flag_count
  -Wl,--export=generals_audio_category_name_ptr
  -Wl,--export=generals_audio_category_name_size
  -Wl,--export=generals_audio_priority_name_ptr
  -Wl,--export=generals_audio_priority_name_size
  -Wl,--export=generals_audio_type_name_ptr
  -Wl,--export=generals_audio_type_name_size
  -Wl,--export=generals_audio_control_name_ptr
  -Wl,--export=generals_audio_control_name_size
  -Wl,--export=generals_audio_event_name_ptr
  -Wl,--export=generals_audio_event_name_size
  -Wl,--export=generals_audio_event_filename_ptr
  -Wl,--export=generals_audio_event_filename_size
  -Wl,--export=generals_audio_event_sounds_ptr
  -Wl,--export=generals_audio_event_sounds_size
  -Wl,--export=generals_audio_event_attack_ptr
  -Wl,--export=generals_audio_event_attack_size
  -Wl,--export=generals_audio_event_decay_ptr
  -Wl,--export=generals_audio_event_decay_size
  -Wl,--export=generals_audio_event_line
  -Wl,--export=generals_audio_event_field_count_at
  -Wl,--export=generals_audio_event_category
  -Wl,--export=generals_audio_event_priority
  -Wl,--export=generals_audio_event_type_mask
  -Wl,--export=generals_audio_event_control_mask
  -Wl,--export=generals_audio_event_volume_x100
  -Wl,--export=generals_audio_event_volume_shift_x100
  -Wl,--export=generals_audio_event_min_volume_x100
  -Wl,--export=generals_audio_event_pitch_shift_min_x100
  -Wl,--export=generals_audio_event_pitch_shift_max_x100
  -Wl,--export=generals_audio_event_delay_min
  -Wl,--export=generals_audio_event_delay_max
  -Wl,--export=generals_audio_event_limit
  -Wl,--export=generals_audio_event_loop_count
  -Wl,--export=generals_audio_event_min_range_x100
  -Wl,--export=generals_audio_event_max_range_x100
  -Wl,--export=generals_audio_event_low_pass_cutoff_x100
  -Wl,--export=generals_audio_event_sound_token_count
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
    "${wasm_dir}/src/audio_module.cpp" \
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
    "${wasm_dir}/src/audio_module.cpp" \
    -o "${out_file}"
fi

echo "Built ${out_file}"
