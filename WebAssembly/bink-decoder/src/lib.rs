//! Focused classic-Bink decoder and the narrow C ABI used by the browser
//! worker. Codec modules are derived from `infinitier_bik_decoder`; see the
//! directory README for the pinned upstream revision and modifications.

pub mod audio;
pub mod binkb;
pub mod bitreader;
pub mod bundle;
pub mod container;
pub mod dct;
pub mod dct3;
pub mod dsp;
pub mod error;
pub mod fft;
pub mod rdft;
pub mod streaming;
pub mod tables;
pub mod video;
pub mod vlc;

pub use audio::AudioDecoder;
pub use container::{AudioFlags, AudioTrack, BikHeader, FrameEntry, parse_header};
pub use error::{BikError, BikResult};
pub use streaming::{
    BikAudioChunk, BikFrame, BikOutputFormat, BikPixels, BikStreamingDecoder, BikVideoFrame,
};
pub use video::{BlockType, Plane, VideoDecoder, VideoFrame};

use std::cell::UnsafeCell;
use std::io::Cursor;

const ABI_VERSION: u32 = 1;
const STATUS_FRAME: i32 = 1;
const STATUS_END: i32 = 0;
const ERROR_NO_DECODER: i32 = -1;
const ERROR_DECODE: i32 = -2;

type MemoryDecoder = BikStreamingDecoder<Cursor<Vec<u8>>>;

struct DecoderState {
    decoder: MemoryDecoder,
    frame: Vec<u8>,
    audio: Vec<i16>,
    frame_number: u32,
    audio_channels: u32,
    audio_sample_rate: u32,
}

impl DecoderState {
    fn new(bytes: Vec<u8>) -> BikResult<Self> {
        let decoder = BikStreamingDecoder::new(Cursor::new(bytes), "browser-memory.bik")?
            .with_output_format(BikOutputFormat::Bgra);
        Ok(Self {
            decoder,
            frame: Vec::new(),
            audio: Vec::new(),
            frame_number: 0,
            audio_channels: 0,
            audio_sample_rate: 0,
        })
    }

    fn decode_next(&mut self) -> BikResult<bool> {
        let Some(decoded) = self.decoder.next_frame()? else {
            return Ok(false);
        };
        let BikPixels::Bgra(frame) = decoded.video.pixels else {
            return Err(BikError::Malformed(
                "decoder returned the wrong pixel format",
            ));
        };
        self.frame = frame;
        self.audio.clear();
        self.audio_channels = 0;
        self.audio_sample_rate = 0;
        if let Some(chunk) = decoded.audio.into_iter().next() {
            self.audio = chunk.samples;
            self.audio_channels = u32::from(chunk.channels);
            self.audio_sample_rate = chunk.sample_rate;
        }
        self.frame_number += 1;
        Ok(true)
    }

    fn seek(&mut self, frame_number: u32) -> BikResult<bool> {
        if frame_number == 0 || frame_number > self.decoder.frame_count() {
            return Err(BikError::Malformed("seek frame is outside the stream"));
        }
        self.decoder.rewind()?;
        self.frame.clear();
        self.audio.clear();
        self.frame_number = 0;
        while self.frame_number < frame_number {
            if !self.decode_next()? {
                return Ok(false);
            }
        }
        Ok(true)
    }
}

struct GlobalState(UnsafeCell<Option<DecoderState>>);

// The module is instantiated in a dedicated, single-threaded Web Worker. No
// reference to this state is shared across threads or retained across calls.
unsafe impl Sync for GlobalState {}

static STATE: GlobalState = GlobalState(UnsafeCell::new(None));

fn with_state<T>(callback: impl FnOnce(&DecoderState) -> T) -> Option<T> {
    // SAFETY: see `GlobalState`'s single-worker invariant above.
    unsafe { (&*STATE.0.get()).as_ref().map(callback) }
}

fn with_state_mut<T>(callback: impl FnOnce(&mut DecoderState) -> T) -> Option<T> {
    // SAFETY: exported calls are synchronous and the worker invokes only one
    // at a time, so no two mutable references can overlap.
    unsafe { (&mut *STATE.0.get()).as_mut().map(callback) }
}

#[unsafe(no_mangle)]
pub extern "C" fn bink_decoder_abi_version() -> u32 {
    ABI_VERSION
}

/// Reserve an input buffer in this module's linear memory. Ownership passes
/// to `bink_decoder_open`, or back to `bink_decoder_free_input` on a JS-side
/// failure before open.
#[unsafe(no_mangle)]
pub extern "C" fn bink_decoder_alloc(length: usize) -> *mut u8 {
    if length == 0 {
        return std::ptr::null_mut();
    }
    Box::into_raw(vec![0u8; length].into_boxed_slice()).cast::<u8>()
}

/// # Safety
///
/// `pointer` and `length` must be the unchanged pair returned by
/// `bink_decoder_alloc`, and ownership must not already have passed to open.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bink_decoder_free_input(pointer: *mut u8, length: usize) {
    if !pointer.is_null() && length > 0 {
        // SAFETY: upheld by the exported ABI contract above.
        drop(unsafe { Box::from_raw(std::ptr::slice_from_raw_parts_mut(pointer, length)) });
    }
}

/// # Safety
///
/// `pointer` must identify `length` initialized bytes allocated by
/// `bink_decoder_alloc(length)`. This call always consumes the allocation.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bink_decoder_open(pointer: *mut u8, length: usize) -> i32 {
    if pointer.is_null() || length == 0 {
        return ERROR_DECODE;
    }
    // SAFETY: upheld by the exported ABI contract above. Converting the exact
    // boxed slice back into a Vec transfers it without copying.
    let bytes =
        unsafe { Box::from_raw(std::ptr::slice_from_raw_parts_mut(pointer, length)).into_vec() };
    let state = match DecoderState::new(bytes) {
        Ok(state) => state,
        Err(_) => return ERROR_DECODE,
    };
    // SAFETY: see `GlobalState`'s single-worker invariant above.
    unsafe { *STATE.0.get() = Some(state) };
    STATUS_FRAME
}

#[unsafe(no_mangle)]
pub extern "C" fn bink_decoder_close() {
    // SAFETY: see `GlobalState`'s single-worker invariant above.
    unsafe { *STATE.0.get() = None };
}

#[unsafe(no_mangle)]
pub extern "C" fn bink_decoder_decode_next() -> i32 {
    match with_state_mut(DecoderState::decode_next) {
        Some(Ok(true)) => STATUS_FRAME,
        Some(Ok(false)) => STATUS_END,
        Some(Err(_)) => ERROR_DECODE,
        None => ERROR_NO_DECODER,
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn bink_decoder_seek(frame_number: u32) -> i32 {
    match with_state_mut(|state| state.seek(frame_number)) {
        Some(Ok(true)) => STATUS_FRAME,
        Some(Ok(false)) => STATUS_END,
        Some(Err(_)) => ERROR_DECODE,
        None => ERROR_NO_DECODER,
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn bink_decoder_width() -> u32 {
    with_state(|state| state.decoder.width()).unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn bink_decoder_height() -> u32 {
    with_state(|state| state.decoder.height()).unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn bink_decoder_frame_count() -> u32 {
    with_state(|state| state.decoder.frame_count()).unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn bink_decoder_frame_duration_us() -> u32 {
    with_state(|state| state.decoder.frame_duration_us()).unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn bink_decoder_frame_number() -> u32 {
    with_state(|state| state.frame_number).unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn bink_decoder_frame_pointer() -> *const u8 {
    with_state(|state| state.frame.as_ptr()).unwrap_or(std::ptr::null())
}

#[unsafe(no_mangle)]
pub extern "C" fn bink_decoder_frame_length() -> usize {
    with_state(|state| state.frame.len()).unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn bink_decoder_audio_pointer() -> *const i16 {
    with_state(|state| state.audio.as_ptr()).unwrap_or(std::ptr::null())
}

#[unsafe(no_mangle)]
pub extern "C" fn bink_decoder_audio_length() -> usize {
    with_state(|state| state.audio.len()).unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn bink_decoder_audio_channels() -> u32 {
    with_state(|state| state.audio_channels).unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn bink_decoder_audio_sample_rate() -> u32 {
    with_state(|state| state.audio_sample_rate).unwrap_or(0)
}
