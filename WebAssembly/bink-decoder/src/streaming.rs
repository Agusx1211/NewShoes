//! High-level streaming decoder over the lower-level [`parse_header`] +
//! [`VideoDecoder`] + [`AudioDecoder`] triple.
//!
//! Mirrors the shape of [`infinitier_mve_decoder::MveDecoder`] —
//! `new(reader, name)` once, `next_frame()` until you get `Ok(None)`.
//! The pixel format is configurable: [`BikOutputFormat::Yuv`]
//! (default — zero-cost, returns the codec's native YUV420p planes) or
//! [`BikOutputFormat::Bgra`] (one BT.601 conversion per frame, matching the
//! browser engine's `BINKSURFACE32` memory order).

use std::io::{Read, Seek, SeekFrom};

use crate::audio::AudioDecoder;
use crate::container::{AudioTrack, BikHeader, parse_header};
use crate::error::BikResult;
use crate::video::{VideoDecoder, VideoFrame};

/// Pixel format of the [`BikVideoFrame`] returned by
/// [`BikStreamingDecoder::next_frame`].
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub enum BikOutputFormat {
    /// Native 4:2:0 YUV planar output, no per-frame conversion. Each
    /// chroma plane is half-resolution in both axes; chroma subsampling
    /// must be handled by the consumer (typically inside a GPU shader).
    #[default]
    Yuv,
    /// Tightly-packed BGRA8 (`width * height * 4` bytes), matching the
    /// little-endian memory layout of Bink's `BINKSURFACE32` output.
    Bgra,
}

/// Pixel payload variant inside a [`BikVideoFrame`]. Which arm is
/// populated is determined at decoder construction by
/// [`BikOutputFormat`].
#[derive(Debug, Clone)]
pub enum BikPixels {
    /// 4:2:0 YUV planar (codec-native). Holds the full
    /// [`VideoFrame`] (Y + U + V + optional alpha planes).
    Yuv(VideoFrame),
    /// Tightly-packed BGRA8 row-major, `width * height * 4` bytes.
    Bgra(Vec<u8>),
}

/// One decoded video frame plus its presentation duration. Pair with
/// [`BikAudioChunk`]s carried by [`BikFrame`].
#[derive(Debug, Clone)]
pub struct BikVideoFrame {
    pub width: u32,
    pub height: u32,
    /// How long to display this frame, in microseconds. Constant
    /// across the stream — Bink stores fps in the header.
    pub duration_us: u32,
    pub pixels: BikPixels,
}

/// PCM audio data accompanying a video frame.
#[derive(Debug, Clone)]
pub struct BikAudioChunk {
    pub channels: u8,
    pub sample_rate: u32,
    /// Interleaved signed 16-bit PCM samples.
    pub samples: Vec<i16>,
}

/// A complete decoded frame: video + at most one audio chunk (Bink's
/// audio is delivered exactly once per video packet, when an audio
/// track is present).
#[derive(Debug, Clone)]
pub struct BikFrame {
    pub video: BikVideoFrame,
    pub audio: Vec<BikAudioChunk>,
}

/// Streaming Bink decoder. Owns the source reader and pulls one
/// [`BikFrame`] per [`Self::next_frame`] call until the indexed frame
/// list is exhausted.
///
/// ```no_run
/// use std::fs::File;
/// use cnc_bink_decoder::{BikOutputFormat, BikPixels, BikStreamingDecoder};
///
/// let f = File::open("intro.bik")?;
/// let mut decoder = BikStreamingDecoder::new(f, "intro.bik")?
///     .with_output_format(BikOutputFormat::Bgra);
///
/// while let Some(frame) = decoder.next_frame()? {
///     if let BikPixels::Bgra(pixels) = &frame.video.pixels {
///         // upload `pixels` to a texture, etc.
///         let _ = pixels;
///     }
///     for chunk in &frame.audio {
///         // feed chunk.samples to your audio sink
///         let _ = chunk;
///     }
/// }
/// # Ok::<(), Box<dyn std::error::Error>>(())
/// ```
pub struct BikStreamingDecoder<R: Read + Seek> {
    reader: R,
    header: BikHeader,
    name: String,
    output_format: BikOutputFormat,

    video: VideoDecoder,
    audio: Option<AudioState>,

    /// Index into `header.frames` of the next frame to deliver.
    frame_idx: usize,
    /// Reused per-frame packet buffer, sized to `header.max_frame_size`
    /// up front so steady-state decoding does not reallocate.
    packet_buf: Vec<u8>,
    /// Frame display duration, in microseconds. Constant across the
    /// stream.
    frame_duration_us: u32,
}

struct AudioState {
    decoder: AudioDecoder,
    channels: u8,
    sample_rate: u32,
}

impl<R: Read + Seek> BikStreamingDecoder<R> {
    /// Build a decoder positioned at byte 0 of `reader`. Defaults to
    /// [`BikOutputFormat::Yuv`]; call
    /// [`Self::with_output_format`] if you want browser-ready BGRA instead.
    pub fn new(mut reader: R, name: impl Into<String>) -> BikResult<Self> {
        let header = parse_header(&mut reader)?;
        let video = VideoDecoder::new(&header)?;
        let audio = match header.audio_tracks.first() {
            Some(track) => Some(open_audio(track)?),
            None => None,
        };
        let frame_duration_us =
            (header.fps_den as u64 * 1_000_000 / header.fps_num.max(1) as u64) as u32;
        let packet_buf = Vec::with_capacity(header.max_frame_size as usize);
        Ok(Self {
            reader,
            header,
            name: name.into(),
            output_format: BikOutputFormat::default(),
            video,
            audio,
            frame_idx: 0,
            packet_buf,
            frame_duration_us,
        })
    }

    /// Builder-style override for the output pixel format.
    pub fn with_output_format(mut self, format: BikOutputFormat) -> Self {
        self.output_format = format;
        self
    }

    /// Caller-supplied label (resource id, file path, …) — the same
    /// string passed to [`Self::new`].
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Pixel format the decoder is currently configured to deliver.
    pub fn output_format(&self) -> BikOutputFormat {
        self.output_format
    }

    pub fn width(&self) -> u32 {
        self.header.width
    }

    pub fn height(&self) -> u32 {
        self.header.height
    }

    /// Constant per-frame display duration in microseconds.
    pub fn frame_duration_us(&self) -> u32 {
        self.frame_duration_us
    }

    /// Total duration of the stream in microseconds.
    pub fn total_duration_us(&self) -> u64 {
        self.header.frame_count as u64 * self.frame_duration_us as u64
    }

    /// Total number of video frames in the stream (from the header).
    pub fn frame_count(&self) -> u32 {
        self.header.frame_count
    }

    /// Read-only access to the parsed Bink header for callers that need
    /// metadata the streaming API doesn't expose directly (codec tag,
    /// alpha presence, raw fps fraction, audio track flags, …).
    pub fn header(&self) -> &BikHeader {
        &self.header
    }

    /// Reset all predictive video/audio state and position the decoder before
    /// frame one. This is intentionally explicit: Bink seeks must rebuild
    /// codec history before decoding the requested frame.
    pub fn rewind(&mut self) -> BikResult<()> {
        self.reader.seek(SeekFrom::Start(0))?;
        self.header = parse_header(&mut self.reader)?;
        self.video = VideoDecoder::new(&self.header)?;
        self.audio = match self.header.audio_tracks.first() {
            Some(track) => Some(open_audio(track)?),
            None => None,
        };
        self.frame_idx = 0;
        self.packet_buf.clear();
        Ok(())
    }

    /// Pull the next [`BikFrame`] (one video frame + the audio chunk
    /// that frame carried, if any). Returns `Ok(None)` once every
    /// indexed frame has been consumed.
    pub fn next_frame(&mut self) -> BikResult<Option<BikFrame>> {
        if self.frame_idx >= self.header.frames.len() {
            return Ok(None);
        }
        let fr = self.header.frames[self.frame_idx];

        self.packet_buf.resize(fr.size as usize, 0);
        self.reader.seek(SeekFrom::Start(fr.pos as u64))?;
        self.reader.read_exact(&mut self.packet_buf)?;

        // Audio is prefixed by a u32 byte length; video runs from there
        // to the end of the packet. Files without audio skip the
        // prefix entirely.
        let mut audio_chunks: Vec<BikAudioChunk> = Vec::new();
        let video_bytes: &[u8] = if let Some(state) = self.audio.as_mut() {
            if self.packet_buf.len() < 4 {
                return Err(crate::error::BikError::Truncated {
                    pos: self.packet_buf.len(),
                    needed: 4usize.saturating_sub(self.packet_buf.len()),
                });
            }
            let aud_len = u32::from_le_bytes([
                self.packet_buf[0],
                self.packet_buf[1],
                self.packet_buf[2],
                self.packet_buf[3],
            ]) as usize;
            if aud_len > self.packet_buf.len() - 4 {
                return Err(crate::error::BikError::Malformed(
                    "audio packet length exceeds frame payload",
                ));
            }
            let pcm = state
                .decoder
                .decode_packet(&self.packet_buf[4..4 + aud_len])?;
            if !pcm.is_empty() {
                audio_chunks.push(BikAudioChunk {
                    channels: state.channels,
                    sample_rate: state.sample_rate,
                    samples: pcm,
                });
            }
            &self.packet_buf[4 + aud_len..]
        } else {
            &self.packet_buf[..]
        };

        let frame = self.video.decode_frame(video_bytes)?;
        let pixels = match self.output_format {
            BikOutputFormat::Yuv => BikPixels::Yuv(frame.clone()),
            BikOutputFormat::Bgra => BikPixels::Bgra(yuv420p_to_bgra8(
                frame,
                self.header.width,
                self.header.height,
            )),
        };

        self.frame_idx += 1;
        Ok(Some(BikFrame {
            video: BikVideoFrame {
                width: self.header.width,
                height: self.header.height,
                duration_us: self.frame_duration_us,
                pixels,
            },
            audio: audio_chunks,
        }))
    }
}

fn open_audio(track: &AudioTrack) -> BikResult<AudioState> {
    Ok(AudioState {
        decoder: AudioDecoder::new(track)?,
        channels: track.flags.channels() as u8,
        sample_rate: track.sample_rate as u32,
    })
}

/// Convert native Bink YUV420p to the byte order expected by
/// `BINKSURFACE32`. Bink/FFmpeg expose these planes as full-range YUV; the
/// coefficients match the upstream RGBA conversion with red and blue stored
/// in little-endian surface order.
fn yuv420p_to_bgra8(frame: &VideoFrame, width: u32, height: u32) -> Vec<u8> {
    let w = width as usize;
    let h = height as usize;
    let chroma_width = w.div_ceil(2);
    let mut out = vec![0u8; w * h * 4];
    for row in 0..h {
        let y_row = &frame.y.data[row * frame.y.stride..row * frame.y.stride + w];
        let chroma_row = row / 2;
        let u_row =
            &frame.u.data[chroma_row * frame.u.stride..chroma_row * frame.u.stride + chroma_width];
        let v_row =
            &frame.v.data[chroma_row * frame.v.stride..chroma_row * frame.v.stride + chroma_width];
        for col in 0..w {
            let y = y_row[col] as f32;
            let u = u_row[col / 2] as f32 - 128.0;
            let v = v_row[col / 2] as f32 - 128.0;
            let offset = (row * w + col) * 4;
            out[offset] = (y + 1.772 * u).clamp(0.0, 255.0) as u8;
            out[offset + 1] = (y - 0.344_136 * u - 0.714_136 * v).clamp(0.0, 255.0) as u8;
            out[offset + 2] = (y + 1.402 * v).clamp(0.0, 255.0) as u8;
            out[offset + 3] = 255;
        }
    }
    out
}
