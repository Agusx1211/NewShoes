//! Video decoder for Bink Video v1 (codec tags `BIKi` / `BIKf` / `BIKg` /
//! `BIKh`).
//!
//! Mirrors `bink_decode_plane` and `decode_frame` in FFmpeg's `bink.c`.
//! BinkB (codec tag `BIKb`) uses a different bundle scheme and is rejected
//! here — every IWD2 cutscene is `BIKi` so we'd never exercise BinkB on
//! that corpus, and adding it later is mechanical (separate `binkb_*`
//! routines that share the same DSP / IDCT primitives).

use crate::bitreader::BitReader;
use crate::bundle::{
    self, Bundles, SourceKind, read_block_types, read_colors, read_dcs, read_motion_values,
    read_patterns, read_runs,
};
use crate::container::BikHeader;
use crate::dct::{read_dct_coeffs, read_residue};
use crate::dsp::{add_pixels8, idct_add, idct_put, scale_block, unquantize_dct_coeffs};
use crate::error::{BikError, BikResult};
use crate::tables::{BINK_INTER_QUANT, BINK_INTRA_QUANT, BINK_PATTERNS, BINK_SCAN};

/// Block-type IDs (decoded from the `BlockTypes` / `SubBlockTypes` bundles).
/// Order matches FFmpeg's `enum BlockTypes`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum BlockType {
    Skip = 0,
    Scaled = 1,
    Motion = 2,
    Run = 3,
    Residue = 4,
    Intra = 5,
    Fill = 6,
    Inter = 7,
    Pattern = 8,
    Raw = 9,
}

impl BlockType {
    fn from_u8(v: u8) -> BikResult<Self> {
        Ok(match v {
            0 => Self::Skip,
            1 => Self::Scaled,
            2 => Self::Motion,
            3 => Self::Run,
            4 => Self::Residue,
            5 => Self::Intra,
            6 => Self::Fill,
            7 => Self::Inter,
            8 => Self::Pattern,
            9 => Self::Raw,
            _ => return Err(BikError::Malformed("unknown block type")),
        })
    }
}

/// One Y/U/V/A plane of a Bink frame.
#[derive(Debug, Clone)]
pub struct Plane {
    pub width: u32,
    pub height: u32,
    /// Stride in bytes (row pitch). At least `width`; in this implementation
    /// we round up to a multiple of 8 so block writes don't have to special-
    /// case the right edge.
    pub stride: usize,
    pub data: Vec<u8>,
}

impl Plane {
    fn new(width: u32, height: u32) -> Self {
        let stride = ((width + 7) & !7) as usize;
        // Round height up to the next 8 too — block-aligned worst case
        // for an 8x8 write at the bottom-right edge.
        let alloc_h = ((height + 7) & !7) as usize;
        Self {
            width,
            height,
            stride,
            data: vec![0u8; stride * alloc_h],
        }
    }
}

/// One decoded YUV(A) frame.
#[derive(Debug, Clone)]
pub struct VideoFrame {
    pub y: Plane,
    pub u: Plane,
    pub v: Plane,
    pub alpha: Option<Plane>,
}

impl VideoFrame {
    pub fn new(width: u32, height: u32, has_alpha: bool) -> Self {
        let cw = width.div_ceil(2);
        let ch = height.div_ceil(2);
        Self {
            y: Plane::new(width, height),
            u: Plane::new(cw, ch),
            v: Plane::new(cw, ch),
            alpha: if has_alpha {
                Some(Plane::new(width, height))
            } else {
                None
            },
        }
    }
}

/// Bink video decoder state.
pub struct VideoDecoder {
    width: u32,
    height: u32,
    has_alpha: bool,
    /// `version >= 'h'` swaps the U/V plane order in the bitstream. False
    /// for `BIKi` / `BIKf` / `BIKg`, true for `BIKh` / `BIKi` (FFmpeg's
    /// `swap_planes = c->version >= 'h'`).
    swap_planes: bool,
    /// `'b' = 0x62`, `'i' = 0x69`, etc. The codec tag's first byte.
    version: u8,
    /// Regular Bink-v1 (`'f'..'k'`) bundles. Unused on the BinkB path.
    bundles: Bundles,
    /// BinkB-specific bundles, allocated only when the codec is `'b'`.
    binkb_bundles: Option<crate::binkb::Bundles>,
    last: Option<VideoFrame>,
    frame_num: u32,
}

impl VideoDecoder {
    /// Build a fresh decoder from the parsed container header. Returns an
    /// error if the codec variant is one we don't (yet) handle.
    pub fn new(header: &BikHeader) -> BikResult<Self> {
        let version = header.signature[3];
        if !matches!(version, b'b' | b'f' | b'g' | b'h' | b'i' | b'k') {
            return Err(BikError::Unsupported("only BIKb/f/g/h/i/k are supported"));
        }
        if header.is_gray() {
            return Err(BikError::Unsupported(
                "greyscale (BINK_FLAG_GRAY) not implemented",
            ));
        }
        let has_alpha = header.has_alpha();

        let binkb_bundles = if version == b'b' {
            Some(crate::binkb::Bundles::new(header.width, header.height))
        } else {
            None
        };

        Ok(Self {
            width: header.width,
            height: header.height,
            has_alpha,
            swap_planes: version >= b'h',
            version,
            bundles: Bundles::new(header.width, header.height),
            binkb_bundles,
            last: None,
            frame_num: 0,
        })
    }

    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }

    pub fn has_alpha(&self) -> bool {
        self.has_alpha
    }

    /// Decode one frame from a complete Bink frame packet (the bytes after
    /// the per-frame `audio_packet_len` u32, i.e. only the video bitstream).
    /// Returns a borrowed reference to the freshly-decoded frame; subsequent
    /// `decode_frame` calls re-use the same internal buffers.
    pub fn decode_frame(&mut self, packet: &[u8]) -> BikResult<&VideoFrame> {
        // BinkB layers each frame in place on top of the previous one; the
        // initial clone provides exactly that behaviour for `SKIP` blocks.
        // Bink-v1 also clones, but its `SKIP` block explicitly copies from
        // `prev` (which then equals `current`'s pixels), so the result is
        // still correct.
        let mut current = self
            .last
            .clone()
            .unwrap_or_else(|| VideoFrame::new(self.width, self.height, self.has_alpha));

        let mut r = BitReader::new(packet);

        if self.version == b'b' {
            self.frame_num += 1;
            return self.decode_frame_binkb(&mut r, current);
        }

        // Optional 32-bit "alpha plane size" header (FFmpeg skips it).
        if self.has_alpha {
            if self.version >= b'i' {
                r.skip_bits(32);
            }
            decode_one_plane(
                &mut r,
                current.alpha.as_mut().expect("alpha set"),
                self.last.as_ref().and_then(|f| f.alpha.as_ref()),
                &mut self.bundles,
                self.width,
                self.height,
                /*is_chroma=*/ false,
                self.version,
            )?;
        }
        if self.version >= b'i' {
            r.skip_bits(32);
        }

        self.frame_num += 1;

        // Plane order: (0=Y, 1=U, 2=V), with U/V swapped on `swap_planes`.
        for plane_index in 0..3 {
            let logical_idx = if plane_index == 0 || !self.swap_planes {
                plane_index
            } else {
                plane_index ^ 3
            };
            let is_chroma = plane_index != 0;
            let (cur_plane, prev_plane) = pick_plane_pair(&mut current, &self.last, logical_idx);
            let plane_w = if is_chroma {
                self.width / 2
            } else {
                self.width
            };
            let plane_h = if is_chroma {
                self.height / 2
            } else {
                self.height
            };
            decode_one_plane(
                &mut r,
                cur_plane,
                prev_plane,
                &mut self.bundles,
                plane_w,
                plane_h,
                is_chroma,
                self.version,
            )?;
            // FFmpeg breaks early when the bitstream is exhausted between
            // planes. Mirror the check.
            if r.bit_pos() >= r.bit_len() {
                break;
            }
        }

        self.last = Some(current);
        Ok(self.last.as_ref().unwrap())
    }

    /// BinkB-only decode path. Mirrors the `c->version == 'b'` branch of
    /// FFmpeg's `decode_frame`: the per-frame buffer is shared with the
    /// previous frame's data (we satisfy that via the upstream clone) and
    /// each plane is processed with the BinkB-specific 10-bundle decoder.
    /// `swap_planes` and the `>= 'i'` 32-bit alignments don't apply.
    fn decode_frame_binkb(
        &mut self,
        r: &mut BitReader<'_>,
        mut current: VideoFrame,
    ) -> BikResult<&VideoFrame> {
        // FFmpeg's `is_key` is `c->frame_num == 1` — true only on the very
        // first frame ever decoded. We've already incremented `frame_num`
        // by the time we get here, so check `== 1`.
        let state = crate::binkb::DecoderState {
            is_first: self.frame_num == 1,
        };
        let bundles = self
            .binkb_bundles
            .as_mut()
            .expect("BinkB bundles allocated for version 'b'");

        for plane_idx in 0..3 {
            let is_chroma = plane_idx != 0;
            let cur_plane = match plane_idx {
                0 => &mut current.y,
                1 => &mut current.u,
                2 => &mut current.v,
                _ => unreachable!(),
            };
            let plane_w = if is_chroma {
                self.width / 2
            } else {
                self.width
            };
            let plane_h = if is_chroma {
                self.height / 2
            } else {
                self.height
            };
            crate::binkb::decode_plane(r, cur_plane, bundles, &state, plane_w, plane_h, is_chroma)?;
            if r.bit_pos() >= r.bit_len() {
                break;
            }
        }

        self.last = Some(current);
        Ok(self.last.as_ref().unwrap())
    }
}

fn pick_plane_pair<'a>(
    current: &'a mut VideoFrame,
    last: &'a Option<VideoFrame>,
    logical_idx: usize,
) -> (&'a mut Plane, Option<&'a Plane>) {
    let cur = match logical_idx {
        0 => &mut current.y,
        1 => &mut current.u,
        2 => &mut current.v,
        3 => current
            .alpha
            .as_mut()
            .expect("alpha logical index without alpha plane"),
        _ => panic!("invalid plane index"),
    };
    let prev = last.as_ref().map(|f| match logical_idx {
        0 => &f.y,
        1 => &f.u,
        2 => &f.v,
        3 => f
            .alpha
            .as_ref()
            .expect("alpha logical index without alpha plane"),
        _ => panic!("invalid plane index"),
    });
    (cur, prev)
}

#[allow(clippy::too_many_arguments)]
fn decode_one_plane(
    r: &mut BitReader<'_>,
    plane: &mut Plane,
    prev: Option<&Plane>,
    bundles: &mut Bundles,
    width: u32,
    height: u32,
    _is_chroma: bool,
    version: u8,
) -> BikResult<()> {
    // BIKk-only "whole-plane fill" early-out: a 1-bit flag at the start of
    // each plane lets the encoder emit a single 8-bit value to fill the
    // entire plane and skip every bundle. Saves a few hundred bytes per
    // mostly-uniform plane (typical for letterbox bars / fade-to-black).
    if version == b'k' && r.read_bit()? != 0 {
        let fill = r.read_bits(8)? as u8;
        let stride = plane.stride;
        for row in 0..plane.height as usize {
            let off = row * stride;
            plane.data[off..off + plane.width as usize].fill(fill);
        }
        // Pre-plane 32-bit alignment is unconditional below; honour it.
        let pos = r.bit_pos();
        if pos & 31 != 0 {
            r.skip_bits(32 - (pos & 31));
        }
        return Ok(());
    }

    // Number of 8x8 blocks horizontally / vertically. The chroma plane is
    // half-size so its block count is half of luma's — this falls out of
    // `width.div_ceil(8)` directly.
    let (bw, bh) = (width.div_ceil(8), height.div_ceil(8));

    bundles.init_lengths(width.max(8));
    bundles.read_all_trees(r)?;

    let stride = plane.stride;

    // BIKk obfuscates the BlockTypes / SubBlockTypes counts by XOR-ing with
    // 0xBB. Other versions don't.
    let count_xor: u32 = if version == b'k' { 0xBB } else { 0 };

    for by in 0..bh {
        // Per-row bundle fills.
        read_block_types(
            r,
            &mut bundles.b[SourceKind::BlockTypes as usize],
            count_xor,
        )?;
        read_block_types(
            r,
            &mut bundles.b[SourceKind::SubBlockTypes as usize],
            count_xor,
        )?;
        // For colors we need an explicit borrow split because read_colors
        // also touches `bundles.colors`.
        {
            let (b_slice, cc) = (&mut bundles.b, &mut bundles.colors);
            read_colors(
                r,
                &mut b_slice[SourceKind::Colors as usize],
                cc,
                /*version_pre_i=*/ false,
            )?;
        }
        read_patterns(r, &mut bundles.b[SourceKind::Pattern as usize])?;
        read_motion_values(r, &mut bundles.b[SourceKind::XOff as usize])?;
        read_motion_values(r, &mut bundles.b[SourceKind::YOff as usize])?;
        read_dcs(
            r,
            &mut bundles.b[SourceKind::IntraDc as usize],
            bundle::DC_START_BITS,
            /*has_sign=*/ false,
        )?;
        read_dcs(
            r,
            &mut bundles.b[SourceKind::InterDc as usize],
            bundle::DC_START_BITS,
            /*has_sign=*/ true,
        )?;
        read_runs(r, &mut bundles.b[SourceKind::Run as usize])?;

        let row_top = (by as usize) * 8 * stride;

        let mut bx = 0u32;
        while bx < bw {
            let blk_raw = bundles.b[SourceKind::BlockTypes as usize].read_u8();
            let blk = BlockType::from_u8(blk_raw)?;
            let dst_off = row_top + (bx as usize) * 8;

            // 16x16 SCALED on an odd row OR odd column means it's the
            // "shadow" partner of an already-decoded 16x16 block: consume
            // the bundle value and skip TWO columns (the partner-pair),
            // matching FFmpeg's `bx++; continue;` (the `continue` re-enters
            // the for-update which adds another `bx++`).
            if (by & 1 != 0 || bx & 1 != 0) && blk == BlockType::Scaled {
                bx += 2;
                continue;
            }

            match blk {
                BlockType::Skip => {
                    copy_block_8(plane, dst_off, prev, dst_off, stride);
                }
                BlockType::Motion => {
                    motion_compensate_8(
                        plane,
                        dst_off,
                        prev,
                        bx as i32,
                        by as i32,
                        bundles,
                        BUNDLE_XOFF,
                        BUNDLE_YOFF,
                        stride,
                        bw,
                        bh,
                    )?;
                }
                BlockType::Run => {
                    decode_run_block_8(
                        r,
                        plane,
                        dst_off,
                        stride,
                        bundles,
                        /*scaled=*/ false,
                        /*ublock=*/ &mut [0u8; 64],
                    )?;
                }
                BlockType::Residue => {
                    motion_compensate_8(
                        plane,
                        dst_off,
                        prev,
                        bx as i32,
                        by as i32,
                        bundles,
                        BUNDLE_XOFF,
                        BUNDLE_YOFF,
                        stride,
                        bw,
                        bh,
                    )?;
                    let mut block = [0i16; 64];
                    let masks_count = r.read_bits(7)? as i32;
                    read_residue(r, &mut block, masks_count)?;
                    add_pixels8(
                        &mut plane.data[dst_off..dst_off + 7 * stride + 8],
                        &block,
                        stride,
                    );
                }
                BlockType::Intra => {
                    decode_intra_block_dct(
                        r, plane, dst_off, stride, bundles, /*scaled=*/ false,
                    )?;
                }
                BlockType::Fill => {
                    let v = bundles.b[SourceKind::Colors as usize].read_u8();
                    fill_block_8(plane, dst_off, stride, v);
                }
                BlockType::Inter => {
                    motion_compensate_8(
                        plane,
                        dst_off,
                        prev,
                        bx as i32,
                        by as i32,
                        bundles,
                        BUNDLE_XOFF,
                        BUNDLE_YOFF,
                        stride,
                        bw,
                        bh,
                    )?;
                    decode_inter_block_dct(r, plane, dst_off, stride, bundles)?;
                }
                BlockType::Pattern => {
                    decode_pattern_block_8(plane, dst_off, stride, bundles);
                }
                BlockType::Raw => {
                    decode_raw_block_8(plane, dst_off, stride, bundles);
                }
                BlockType::Scaled => {
                    decode_scaled_block(r, plane, dst_off, stride, bundles)?;
                    // SCALED writes 16x16 at (bx, by); we still need to skip
                    // the next bx position too.
                    bx += 1;
                }
            }
            bx += 1;
        }
    }

    // 32-bit alignment between planes.
    let pos = r.bit_pos();
    if pos & 31 != 0 {
        r.skip_bits(32 - (pos & 31));
    }
    Ok(())
}

const BUNDLE_XOFF: SourceKind = SourceKind::XOff;
const BUNDLE_YOFF: SourceKind = SourceKind::YOff;

/// 8x8 block copy from `prev` (or `plane` itself when `prev == None`,
/// matching FFmpeg's first-frame behaviour). Always goes through a 64-byte
/// scratch so source / destination overlap is harmless.
fn copy_block_8(
    plane: &mut Plane,
    dst_off: usize,
    prev: Option<&Plane>,
    src_off: usize,
    stride: usize,
) {
    let mut tmp = [0u8; 64];
    match prev {
        Some(p) => {
            for i in 0..8 {
                tmp[i * 8..i * 8 + 8]
                    .copy_from_slice(&p.data[src_off + i * stride..src_off + i * stride + 8]);
            }
        }
        None => {
            for i in 0..8 {
                tmp[i * 8..i * 8 + 8]
                    .copy_from_slice(&plane.data[src_off + i * stride..src_off + i * stride + 8]);
            }
        }
    }
    for i in 0..8 {
        plane.data[dst_off + i * stride..dst_off + i * stride + 8]
            .copy_from_slice(&tmp[i * 8..i * 8 + 8]);
    }
}

/// Motion-compensated 8x8 block copy. Reads x/y offsets from the bundles,
/// resolves the source coordinate, falls back to "copy from current" when
/// `prev` is absent (first frame).
#[allow(clippy::too_many_arguments)]
fn motion_compensate_8(
    plane: &mut Plane,
    dst_off: usize,
    prev: Option<&Plane>,
    bx: i32,
    by: i32,
    bundles: &mut Bundles,
    xb: SourceKind,
    yb: SourceKind,
    stride: usize,
    bw: u32,
    bh: u32,
) -> BikResult<()> {
    let xoff = bundles.b[xb as usize].read_i8() as i32;
    let yoff = bundles.b[yb as usize].read_i8() as i32;
    let src_x = bx * 8 + xoff;
    let src_y = by * 8 + yoff;
    if src_x < 0 || src_y < 0 || src_x as u32 + 8 > bw * 8 || src_y as u32 + 8 > bh * 8 {
        return Err(BikError::Malformed("motion vector out of bounds"));
    }
    let src_off = (src_y as usize) * stride + (src_x as usize);
    copy_block_8(plane, dst_off, prev, src_off, stride);
    Ok(())
}

/// `RUN_BLOCK`. Walks a 64-position scan order picked from `BINK_PATTERNS`,
/// emitting runs of `(value | one-color)` either pulled fresh from the
/// `Colors` bundle or repeated from a single fresh value.
///
/// `scaled = true` writes into `ublock[64]` (later upscaled to 16x16) rather
/// than directly into the plane.
fn decode_run_block_8(
    r: &mut BitReader<'_>,
    plane: &mut Plane,
    dst_off: usize,
    stride: usize,
    bundles: &mut Bundles,
    scaled: bool,
    ublock: &mut [u8; 64],
) -> BikResult<()> {
    if r.bits_left() < 4 {
        return Err(BikError::Truncated {
            pos: r.bit_pos(),
            needed: 4,
        });
    }
    let scan_idx = r.read_bits(4)? as usize;
    let scan = &BINK_PATTERNS[scan_idx];
    let mut i: usize = 0;
    let mut sp = 0usize;
    let write = |plane: &mut Plane, ublock: &mut [u8; 64], pos: u8, v: u8| {
        if scaled {
            ublock[pos as usize] = v;
        } else {
            // pos in scan-order = position-in-block (0..63 with x in low 3
            // bits, y in next 3).
            let py = (pos >> 3) as usize;
            let px = (pos & 7) as usize;
            plane.data[dst_off + py * stride + px] = v;
        }
    };

    while i < 63 {
        let run = (bundles.b[SourceKind::Run as usize].read_u8() as usize) + 1;
        i += run;
        if i > 64 {
            return Err(BikError::Malformed("RUN block run-length overflow"));
        }
        if r.read_bit()? != 0 {
            let v = bundles.b[SourceKind::Colors as usize].read_u8();
            for _ in 0..run {
                write(plane, ublock, scan[sp], v);
                sp += 1;
            }
        } else {
            for _ in 0..run {
                let v = bundles.b[SourceKind::Colors as usize].read_u8();
                write(plane, ublock, scan[sp], v);
                sp += 1;
            }
        }
    }
    if i == 63 {
        let v = bundles.b[SourceKind::Colors as usize].read_u8();
        write(plane, ublock, scan[sp], v);
    }
    Ok(())
}

fn decode_intra_block_dct(
    r: &mut BitReader<'_>,
    plane: &mut Plane,
    dst_off: usize,
    stride: usize,
    bundles: &mut Bundles,
    scaled: bool,
) -> BikResult<()> {
    let mut block = [0i32; 64];
    block[0] = bundles.b[SourceKind::IntraDc as usize].read_i16() as i32;
    let mut coef_idx = [0u8; 64];
    let mut count = 0usize;
    let q = read_dct_coeffs(r, &mut block, &BINK_SCAN, &mut coef_idx, &mut count, -1)?;
    unquantize_dct_coeffs(
        &mut block,
        &BINK_INTRA_QUANT[q as usize],
        &coef_idx[..count],
        &BINK_SCAN,
    );
    if scaled {
        // For scaled intra we IDCT into a temporary 8x8 ublock, the caller
        // passes that to scale_block.
        unreachable!("scaled IDCT path is handled by decode_scaled_block");
    } else {
        idct_put(
            &mut plane.data[dst_off..dst_off + 7 * stride + 8],
            stride,
            &block,
        );
    }
    Ok(())
}

fn decode_inter_block_dct(
    r: &mut BitReader<'_>,
    plane: &mut Plane,
    dst_off: usize,
    stride: usize,
    bundles: &mut Bundles,
) -> BikResult<()> {
    let mut block = [0i32; 64];
    block[0] = bundles.b[SourceKind::InterDc as usize].read_i16() as i32;
    let mut coef_idx = [0u8; 64];
    let mut count = 0usize;
    let q = read_dct_coeffs(r, &mut block, &BINK_SCAN, &mut coef_idx, &mut count, -1)?;
    unquantize_dct_coeffs(
        &mut block,
        &BINK_INTER_QUANT[q as usize],
        &coef_idx[..count],
        &BINK_SCAN,
    );
    idct_add(
        &mut plane.data[dst_off..dst_off + 7 * stride + 8],
        stride,
        &mut block,
    );
    Ok(())
}

/// `FILL_BLOCK` for an 8x8 region.
fn fill_block_8(plane: &mut Plane, dst_off: usize, stride: usize, v: u8) {
    for i in 0..8 {
        let row = dst_off + i * stride;
        plane.data[row..row + 8].fill(v);
    }
}

/// `FILL_BLOCK` for a 16x16 region.
fn fill_block_16(plane: &mut Plane, dst_off: usize, stride: usize, v: u8) {
    for i in 0..16 {
        let row = dst_off + i * stride;
        plane.data[row..row + 16].fill(v);
    }
}

/// `PATTERN_BLOCK` (8x8): two pixel values selected per-bit across 8 bytes
/// of pattern data.
fn decode_pattern_block_8(plane: &mut Plane, dst_off: usize, stride: usize, bundles: &mut Bundles) {
    let c0 = bundles.b[SourceKind::Colors as usize].read_u8();
    let c1 = bundles.b[SourceKind::Colors as usize].read_u8();
    let cols = [c0, c1];
    for i in 0..8 {
        let mut v = bundles.b[SourceKind::Pattern as usize].read_u8();
        let row = dst_off + i * stride;
        for j in 0..8 {
            plane.data[row + j] = cols[(v & 1) as usize];
            v >>= 1;
        }
    }
}

/// `RAW_BLOCK` (8x8): drain 64 raw bytes from the `Colors` bundle.
fn decode_raw_block_8(plane: &mut Plane, dst_off: usize, stride: usize, bundles: &mut Bundles) {
    // FFmpeg reads from `cur_ptr` directly; we do the same to skip 64
    // individual `read_u8` calls.
    let b = &mut bundles.b[SourceKind::Colors as usize];
    let src_ptr = b.cur_ptr;
    for i in 0..8 {
        let row = dst_off + i * stride;
        plane.data[row..row + 8].copy_from_slice(&b.data[src_ptr + i * 8..src_ptr + i * 8 + 8]);
    }
    b.cur_ptr += 64;
}

/// `SCALED_BLOCK` (16x16): read sub-block type, decode into an 8x8 ublock,
/// then 2x2-replicate to the destination. Mirrors the inner switch in
/// `bink_decode_plane`.
fn decode_scaled_block(
    r: &mut BitReader<'_>,
    plane: &mut Plane,
    dst_off: usize,
    stride: usize,
    bundles: &mut Bundles,
) -> BikResult<()> {
    let sub = BlockType::from_u8(bundles.b[SourceKind::SubBlockTypes as usize].read_u8())?;
    if sub == BlockType::Fill {
        // Fill is the only sub-type that writes the 16x16 destination
        // directly without going through scale_block.
        let v = bundles.b[SourceKind::Colors as usize].read_u8();
        fill_block_16(plane, dst_off, stride, v);
        return Ok(());
    }
    let mut ublock = [0u8; 64];
    match sub {
        BlockType::Run => {
            // The RUN sub-block writes to ublock; share the regular RUN
            // decoder via the `scaled = true` flag.
            decode_run_block_8(
                r,
                plane,
                /*dst_off=*/ 0,
                /*stride=*/ 0,
                bundles,
                true,
                &mut ublock,
            )?;
        }
        BlockType::Intra => {
            // Same as regular INTRA but the IDCT goes to ublock with
            // stride 8 instead of `plane`.
            let mut block = [0i32; 64];
            block[0] = bundles.b[SourceKind::IntraDc as usize].read_i16() as i32;
            let mut coef_idx = [0u8; 64];
            let mut count = 0usize;
            let q = read_dct_coeffs(r, &mut block, &BINK_SCAN, &mut coef_idx, &mut count, -1)?;
            unquantize_dct_coeffs(
                &mut block,
                &BINK_INTRA_QUANT[q as usize],
                &coef_idx[..count],
                &BINK_SCAN,
            );
            idct_put(&mut ublock, 8, &block);
        }
        BlockType::Pattern => {
            let c0 = bundles.b[SourceKind::Colors as usize].read_u8();
            let c1 = bundles.b[SourceKind::Colors as usize].read_u8();
            let cols = [c0, c1];
            for j in 0..8 {
                let mut v = bundles.b[SourceKind::Pattern as usize].read_u8();
                for i in 0..8 {
                    ublock[i + j * 8] = cols[(v & 1) as usize];
                    v >>= 1;
                }
            }
        }
        BlockType::Raw => {
            for j in 0..8 {
                for i in 0..8 {
                    ublock[i + j * 8] = bundles.b[SourceKind::Colors as usize].read_u8();
                }
            }
        }
        _ => return Err(BikError::Malformed("invalid 16x16 sub-block type")),
    }
    scale_block(
        &ublock,
        &mut plane.data[dst_off..dst_off + 15 * stride + 16],
        stride,
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Sanity: VideoFrame allocation matches the requested dimensions and
    /// rounds the stride up to the next 8.
    #[test]
    fn frame_alloc_dimensions() {
        let f = VideoFrame::new(640, 480, false);
        assert_eq!(f.y.width, 640);
        assert_eq!(f.y.height, 480);
        assert_eq!(f.y.stride, 640);
        assert_eq!(f.u.width, 320);
        assert_eq!(f.u.height, 240);
        assert!(f.alpha.is_none());
    }

    #[test]
    fn frame_alloc_with_alpha() {
        let f = VideoFrame::new(320, 200, true);
        assert!(f.alpha.is_some());
        let a = f.alpha.unwrap();
        assert_eq!(a.width, 320);
        assert_eq!(a.height, 200);
    }

    #[test]
    fn fill_block_8_writes_8x8() {
        let mut p = Plane::new(16, 16);
        let stride = p.stride;
        fill_block_8(&mut p, 0, stride, 0xAB);
        for i in 0..8 {
            for j in 0..8 {
                assert_eq!(p.data[i * stride + j], 0xAB);
            }
        }
        // pixel just outside the 8x8 region must still be 0.
        assert_eq!(p.data[8 * stride], 0);
    }

    #[test]
    fn fill_block_16_writes_16x16() {
        let mut p = Plane::new(16, 16);
        let stride = p.stride;
        fill_block_16(&mut p, 0, stride, 0xCD);
        assert_eq!(p.data[15 * stride + 15], 0xCD);
        assert_eq!(p.data[0], 0xCD);
    }

    #[test]
    fn copy_block_8_via_temp_handles_overlap() {
        let mut p = Plane::new(16, 16);
        // Fill p with a known pattern.
        for i in 0..p.data.len() {
            p.data[i] = i as u8;
        }
        let stride = p.stride;
        // In-place copy from offset (0,0) to itself — should leave the
        // pattern intact.
        copy_block_8(&mut p, 0, None, 0, stride);
        for i in 0..8 {
            for j in 0..8 {
                assert_eq!(p.data[i * stride + j], (i * stride + j) as u8);
            }
        }
    }
}
