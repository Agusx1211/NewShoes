//! BIKi container parser.
//!
//! Mirrors FFmpeg's `bink.c` `read_header` / demuxer logic and gemrb's
//! `BIKPlayer::ReadHeader`. Layout of a Bink Video v1 file (all integers
//! little-endian):
//!
//! ```text
//! 0x00  4   signature      "BIKi" / "BIKb" / "BIKf"
//! 0x04  u32 file_size      file_size_field; actual size = field + 8
//! 0x08  u32 frame_count    must be < 1_000_000
//! 0x0C  u32 max_frame_size capped at file_size for sanity
//! 0x10  u32 frame_count2   duplicate, ignored
//! 0x14  u32 width
//! 0x18  u32 height
//! 0x1C  u32 fps_num        > 0
//! 0x20  u32 fps_den        > 0
//! 0x24  u32 video_flags    BINK_FLAG_ALPHA / BINK_FLAG_GRAY (FFmpeg names)
//! 0x28  u32 num_tracks
//!
//! per-track table 1: 4 bytes per track (audio max packet size — gemrb skips)
//! per-track table 2: u16 sample_rate + u16 audio_flags  (4 bytes per track)
//! per-track table 3: 4 bytes per track (track id — gemrb skips)
//!
//! frame index table: (frame_count + 1) u32 entries
//!   bit 0  = keyframe flag for the OPENING entry of the frame
//!   bits 1.. = byte offset of the frame's data in the file
//! ```
//!
//! Each frame's payload begins with a `u32 audio_packet_len` followed by
//! `audio_packet_len` bytes of audio (multi-track is multiplexed inside that
//! block but every IWD2 file has a single audio track) and then the video
//! bitstream out to the end of the frame.

use std::io::{Read, Seek, SeekFrom};

use crate::error::{BikError, BikResult};

/// Maximum frames the parser will accept. Matches FFmpeg's anti-DoS limit.
const MAX_FRAMES: u32 = 1_000_000;
/// Same limit as FFmpeg's Bink demuxer.
const MAX_AUDIO_TRACKS: u32 = 256;
/// Bound decoder-owned planes and the BGRA presentation buffer before any
/// allocation. This still permits 8K video while rejecting hostile headers.
const MAX_PIXELS: u64 = 64 * 1024 * 1024;

/// `video_flags` bits we recognise. Same names as FFmpeg.
pub mod video_flags {
    pub const ALPHA: u32 = 0x0010_0000;
    pub const GRAY: u32 = 0x0002_0000;
}

/// Parsed Bink container header.
#[derive(Debug, Clone)]
pub struct BikHeader {
    /// First 4 bytes of the file (`BIKi`, `BIKb`, or `BIKf`).
    pub signature: [u8; 4],
    /// Total file size in bytes (after the on-disk `+8` correction).
    pub file_size: u64,
    pub frame_count: u32,
    /// Largest frame payload in bytes — used to size the per-frame scratch
    /// buffer.
    pub max_frame_size: u32,
    pub width: u32,
    pub height: u32,
    pub fps_num: u32,
    pub fps_den: u32,
    pub video_flags: u32,
    /// Audio tracks, in order. Empty when `num_tracks == 0`.
    pub audio_tracks: Vec<AudioTrack>,
    /// Per-frame index. Length `frame_count`.
    pub frames: Vec<FrameEntry>,
}

impl BikHeader {
    /// True when the video carries an alpha plane (`BINK_FLAG_ALPHA`).
    pub fn has_alpha(&self) -> bool {
        (self.video_flags & video_flags::ALPHA) != 0
    }

    /// True when the video is greyscale only.
    pub fn is_gray(&self) -> bool {
        (self.video_flags & video_flags::GRAY) != 0
    }

    /// Frame rate as a single number, for display / logging.
    pub fn fps(&self) -> f64 {
        self.fps_num as f64 / self.fps_den as f64
    }
}

#[derive(Debug, Clone, Copy)]
pub struct AudioTrack {
    pub sample_rate: u16,
    pub flags: AudioFlags,
}

/// `audio_flags` bit field stored in the per-track header.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AudioFlags(u16);

impl AudioFlags {
    /// `BINK_AUD_USEDCT` — DCT-based audio (`binkaudio_dct`). When clear,
    /// the file uses RDFT-based audio (`binkaudio_rdft`).
    pub const USE_DCT: Self = Self(0x1000);
    /// `BINK_AUD_STEREO` — stereo when set, mono otherwise.
    pub const STEREO: Self = Self(0x2000);
    /// `BINK_AUD_16BITS` — request 16-bit output. Always set in practice.
    pub const BITS_16: Self = Self(0x4000);

    pub const fn from_bits_truncate(bits: u16) -> Self {
        Self(bits & (Self::USE_DCT.0 | Self::STEREO.0 | Self::BITS_16.0))
    }

    pub const fn contains(self, other: Self) -> bool {
        self.0 & other.0 == other.0
    }

    pub fn channels(self) -> u16 {
        if self.contains(AudioFlags::STEREO) {
            2
        } else {
            1
        }
    }
}

impl std::ops::BitOr for AudioFlags {
    type Output = Self;

    fn bitor(self, rhs: Self) -> Self::Output {
        Self(self.0 | rhs.0)
    }
}

impl std::ops::BitOrAssign for AudioFlags {
    fn bitor_assign(&mut self, rhs: Self) {
        self.0 |= rhs.0;
    }
}

/// One frame's location and key-frame status within the file.
#[derive(Debug, Clone, Copy)]
pub struct FrameEntry {
    /// Absolute byte offset of the frame payload from the start of the file.
    pub pos: u32,
    /// Payload length in bytes.
    pub size: u32,
    /// `true` when the encoder marked this frame as a key (intra-only) frame.
    pub keyframe: bool,
}

/// Parses a Bink container header from a seekable stream. Leaves the stream
/// positioned just after the trailing pre-frame padding (i.e. ready for
/// random-access frame reads via `FrameEntry::pos`).
pub fn parse_header<R: Read + Seek>(r: &mut R) -> BikResult<BikHeader> {
    r.seek(SeekFrom::Start(0))?;
    let mut sig = [0u8; 4];
    r.read_exact(&mut sig)?;
    // FFmpeg's bink demuxer accepts BIKi (most common), BIKb, BIKf, BIKg, BIKh,
    // and BIKk (Bink Video v1 family). KB2 (Bink2) starts with "KB2 " and is
    // a different codec entirely — we reject it.
    if !is_bink_v1_signature(&sig) {
        return Err(BikError::BadSignature(sig));
    }

    let file_size_field = read_u32(r)?;
    let file_size = (file_size_field as u64) + 8;

    let frame_count = read_u32(r)?;
    if frame_count == 0 || frame_count > MAX_FRAMES {
        return Err(BikError::InvalidHeader {
            field: "frame_count",
            value: frame_count as u64,
            limit: MAX_FRAMES as u64,
        });
    }

    let max_frame_size = read_u32(r)?;
    if (max_frame_size as u64) > file_size {
        return Err(BikError::InvalidHeader {
            field: "max_frame_size",
            value: max_frame_size as u64,
            limit: file_size,
        });
    }

    // frame_count2 — same value, ignored.
    let _ = read_u32(r)?;

    let width = read_u32(r)?;
    let height = read_u32(r)?;
    if width == 0
        || height == 0
        || width > 32_768
        || height > 32_768
        || u64::from(width) * u64::from(height) > MAX_PIXELS
    {
        return Err(BikError::InvalidHeader {
            field: "dimensions",
            value: ((width as u64) << 32) | height as u64,
            limit: 32_768,
        });
    }

    let fps_num = read_u32(r)?;
    let fps_den = read_u32(r)?;
    if fps_num == 0 || fps_den == 0 {
        return Err(BikError::InvalidHeader {
            field: "fps",
            value: ((fps_num as u64) << 32) | fps_den as u64,
            limit: 0,
        });
    }

    let video_flags = read_u32(r)?;
    let num_tracks = read_u32(r)?;
    if num_tracks > MAX_AUDIO_TRACKS {
        return Err(BikError::InvalidHeader {
            field: "audio_tracks",
            value: u64::from(num_tracks),
            limit: u64::from(MAX_AUDIO_TRACKS),
        });
    }

    // Per-track headers: 3 tables of 4-byte entries each.
    let mut audio_tracks = Vec::with_capacity(num_tracks as usize);
    if num_tracks > 0 {
        // Table 1: 4 bytes per track (max audio packet size; we don't need
        // it — the per-frame audio length is stored alongside the payload).
        seek_skip(r, 4 * num_tracks as i64)?;
        // Table 2: u16 sample_rate, u16 audio_flags per track.
        for _ in 0..num_tracks {
            let sample_rate = read_u16(r)?;
            let raw_flags = read_u16(r)?;
            audio_tracks.push(AudioTrack {
                sample_rate,
                flags: AudioFlags::from_bits_truncate(raw_flags),
            });
        }
        // Table 3: 4 bytes per track (track id — opaque to us).
        seek_skip(r, 4 * num_tracks as i64)?;
    }

    // Frame index table: (frame_count + 1) u32 entries. Last one is the
    // file-end sentinel — gemrb reads it explicitly, FFmpeg derives it from
    // file_size. We store the explicit value when present and fall back.
    let mut raw_offsets: Vec<u32> = Vec::with_capacity(frame_count as usize + 1);
    for _ in 0..frame_count {
        raw_offsets.push(read_u32(r)?);
    }
    // Read the trailing sentinel; if it's missing or zero (some unusual
    // files do this), fall back to file_size.
    let sentinel = read_u32(r).unwrap_or(0);
    let end_offset = if sentinel == 0 {
        file_size as u32
    } else {
        sentinel & !1u32
    };

    // Convert (offset, keyframe-bit) pairs to (pos, size, keyframe).
    let mut frames = Vec::with_capacity(frame_count as usize);
    for i in 0..frame_count as usize {
        let raw_cur = raw_offsets[i];
        let pos = raw_cur & !1u32;
        let keyframe = (raw_cur & 1) != 0;

        let raw_next = if i + 1 < raw_offsets.len() {
            raw_offsets[i + 1]
        } else {
            end_offset
        };
        let next = raw_next & !1u32;
        if next <= pos {
            return Err(BikError::InvalidFrameIndex {
                index: i,
                cur: pos,
                next,
            });
        }
        let mut size = next - pos;
        // Mirror gemrb's safety clamp: a frame can never exceed
        // `max_frame_size` per the header's own contract.
        if size > max_frame_size {
            size = max_frame_size;
        }
        frames.push(FrameEntry {
            pos,
            size,
            keyframe,
        });
    }

    // After the last frame-index entry (and the sentinel) FFmpeg expects 4
    // bytes of trailer; gemrb skips them. Tolerate either ordering — we
    // don't seek the stream at the end since callers will jump to
    // `frames[i].pos` for random access anyway.

    Ok(BikHeader {
        signature: sig,
        file_size,
        frame_count,
        max_frame_size,
        width,
        height,
        fps_num,
        fps_den,
        video_flags,
        audio_tracks,
        frames,
    })
}

fn is_bink_v1_signature(s: &[u8; 4]) -> bool {
    matches!(s, b"BIKi" | b"BIKb" | b"BIKf" | b"BIKg" | b"BIKh" | b"BIKk")
}

fn read_u16<R: Read>(r: &mut R) -> std::io::Result<u16> {
    let mut buf = [0u8; 2];
    r.read_exact(&mut buf)?;
    Ok(u16::from_le_bytes(buf))
}

fn read_u32<R: Read>(r: &mut R) -> std::io::Result<u32> {
    let mut buf = [0u8; 4];
    r.read_exact(&mut buf)?;
    Ok(u32::from_le_bytes(buf))
}

fn seek_skip<R: Seek>(r: &mut R, n: i64) -> std::io::Result<()> {
    r.seek(SeekFrom::Current(n))?;
    Ok(())
}
