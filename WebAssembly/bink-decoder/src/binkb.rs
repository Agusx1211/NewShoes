//! BinkB (`BIKb`) video decoder.
//!
//! BinkB predates BIKi and uses a different bitstream layout: ten "source"
//! bundles instead of nine, every value coded with a fixed bit-width
//! (no Huffman trees), nine block types (`SKIP/RUN/INTRA/RESIDUE/INTER/
//! FILL/PATTERN/MOTION/RAW`), and quantisation tables built once from
//! seed/numerator/denominator triples instead of being shipped in the
//! file. Frames are layered *in place* on top of the previous frame
//! rather than being decoded into a fresh buffer — `SKIP` literally means
//! "leave these 64 pixels alone".
//!
//! Mirrors `binkb_decode_plane` and friends in FFmpeg's `bink.c`.

use std::sync::OnceLock;

use crate::bitreader::BitReader;
use crate::dct::read_dct_coeffs;
use crate::dsp::{add_pixels8, idct_add, idct_put, unquantize_dct_coeffs};
use crate::error::{BikError, BikResult};
use crate::tables::{
    BINK_PATTERNS, BINK_SCAN, BINKB_DEN, BINKB_INTER_SEED, BINKB_INTRA_SEED, BINKB_NUM,
    BINKB_RUNBITS,
};
use crate::video::Plane;

/// 10 source kinds, in the same order as FFmpeg's `enum OldSources`.
#[derive(Debug, Clone, Copy)]
#[repr(u8)]
pub enum BinkbSource {
    BlockTypes = 0,
    Colors = 1,
    Pattern = 2,
    XOff = 3,
    YOff = 4,
    IntraDc = 5,
    InterDc = 6,
    IntraQ = 7,
    InterQ = 8,
    InterCoefs = 9,
}

const NB_SRC: usize = 10;

/// Bits per stored value, by source kind. Values with `>8` bits are
/// stored as `i16` (little-endian) in the bundle's byte buffer; the rest
/// fit in a single byte.
const BUNDLE_SIZES: [u8; NB_SRC] = [4, 8, 8, 5, 5, 11, 11, 4, 4, 7];

/// Whether each source kind is signed. Unsigned values pass through
/// verbatim; signed values are translated by subtracting `1 << (bits-1)`
/// at decode time, matching FFmpeg's `get_bits(gb, bits) - mask`.
const BUNDLE_SIGNED: [bool; NB_SRC] = [
    false, false, false, true, true, false, true, false, false, false,
];

/// One BinkB bundle. Each row of an 8x8 block grid refills all 10
/// bundles up-front, then the block decoder pulls values via
/// `read_*` helpers.
pub struct Bundle {
    /// Values stored little-endian (u8 for `bits ≤ 8`, i16 for `bits > 8`).
    data: Vec<u8>,
    /// Write cursor (next byte the refill writes into). `None` means
    /// "permanently exhausted" — set when the encoder writes `t == 0` for
    /// the count, mirroring FFmpeg's `b->cur_dec = NULL` sentinel.
    /// Subsequent refill calls early-return without consuming bits.
    cur_dec: Option<usize>,
    /// Read cursor (next byte the consumer reads from).
    cur_ptr: usize,
    /// Bits-per-count for the refill. Always 13 in BinkB.
    pub len: u8,
}

/// All 10 bundles for one decoder instance.
pub struct Bundles {
    pub b: [Bundle; NB_SRC],
}

impl Bundles {
    pub fn new(width: u32, height: u32) -> Self {
        // Per FFmpeg's `init_bundles`: `bw * bh * 64` bytes. Refills can
        // exceed `bw` per row when an 11-bit bundle stores i16 values,
        // so we double the byte budget for safety. Memory is a few hundred
        // KB at typical Bink sizes — negligible.
        let bw = width.div_ceil(8);
        let bh = height.div_ceil(8);
        let cap = (bw * bh * 64 * 2) as usize;
        Self {
            b: std::array::from_fn(|_| Bundle {
                data: vec![0u8; cap],
                cur_dec: Some(0),
                cur_ptr: 0,
                len: 13,
            }),
        }
    }

    pub fn reset_cursors(&mut self) {
        for bb in &mut self.b {
            bb.cur_dec = Some(0);
            bb.cur_ptr = 0;
        }
    }
}

/// Refill one bundle for the upcoming row of 8×8 blocks.
///
/// Mirrors `CHECK_READ_VAL` + `binkb_read_bundle` in FFmpeg's `bink.c`:
/// * If the bundle has already been marked exhausted (`cur_dec` is
///   `None`) — the decoder previously read `t == 0` for the count — bail
///   without consuming bits.
/// * If the consumer hasn't caught up yet (`cur_dec > cur_ptr`), bail
///   without consuming bits.
/// * Otherwise read the 13-bit count. `t == 0` flips the bundle to
///   exhausted (caller's later rows are no-ops) and returns.
/// * Otherwise drain `t` values from the stream into the data buffer.
pub fn read_bundle(r: &mut BitReader<'_>, bundle: &mut Bundle, kind: BinkbSource) -> BikResult<()> {
    let kind_idx = kind as usize;
    let bits = BUNDLE_SIZES[kind_idx] as u32;
    let signed = BUNDLE_SIGNED[kind_idx];
    let mask: i32 = 1 << (bits - 1);

    let cur_dec = match bundle.cur_dec {
        Some(v) => v,
        None => return Ok(()),
    };
    if cur_dec > bundle.cur_ptr {
        return Ok(());
    }
    let len = r.read_bits(bundle.len as u32)? as usize;
    if len == 0 {
        bundle.cur_dec = None;
        return Ok(());
    }
    let bytes_per_val = if bits <= 8 { 1usize } else { 2 };
    let needed = len * bytes_per_val;
    if cur_dec + needed > bundle.data.len() {
        return Err(BikError::Malformed("BinkB bundle overflow"));
    }

    let mut idx = cur_dec;
    if bits <= 8 {
        for _ in 0..len {
            let raw = r.read_bits(bits)? as i32;
            let v = if signed { raw - mask } else { raw };
            bundle.data[idx] = v as u8;
            idx += 1;
        }
    } else {
        for _ in 0..len {
            let raw = r.read_bits(bits)? as i32;
            let v = if signed { raw - mask } else { raw };
            let bytes = (v as i16).to_le_bytes();
            bundle.data[idx] = bytes[0];
            bundle.data[idx + 1] = bytes[1];
            idx += 2;
        }
    }
    bundle.cur_dec = Some(idx);
    Ok(())
}

#[inline]
pub fn read_u8(b: &mut Bundle) -> u8 {
    let v = b.data[b.cur_ptr];
    b.cur_ptr += 1;
    v
}

#[inline]
pub fn read_i8(b: &mut Bundle) -> i8 {
    let v = b.data[b.cur_ptr] as i8;
    b.cur_ptr += 1;
    v
}

#[inline]
pub fn read_i16(b: &mut Bundle) -> i16 {
    let lo = b.data[b.cur_ptr] as u16;
    let hi = b.data[b.cur_ptr + 1] as u16;
    b.cur_ptr += 2;
    ((hi << 8) | lo) as i16
}

/// Per-position scaling factors used to derive `binkb_intra_quant` /
/// `binkb_inter_quant`. Lifted verbatim from FFmpeg's `binkb_calc_quant`
/// (the static `s[64]` array — 64 i32 constants).
const BINKB_S: [i32; 64] = [
    1073741824, 1489322693, 1402911301, 1262586814, 1073741824, 843633538, 581104888, 296244703,
    1489322693, 2065749918, 1945893874, 1751258219, 1489322693, 1170153332, 806015634, 410903207,
    1402911301, 1945893874, 1832991949, 1649649171, 1402911301, 1102260336, 759250125, 387062357,
    1262586814, 1751258219, 1649649171, 1484645031, 1262586814, 992008094, 683307060, 348346918,
    1073741824, 1489322693, 1402911301, 1262586814, 1073741824, 843633538, 581104888, 296244703,
    843633538, 1170153332, 1102260336, 992008094, 843633538, 662838617, 456571181, 232757969,
    581104888, 806015634, 759250125, 683307060, 581104888, 456571181, 314491699, 160326478,
    296244703, 410903207, 387062357, 348346918, 296244703, 232757969, 160326478, 81733730,
];

/// Per-`(qp, scan_pos)` BinkB intra dequantisation table. Lazily computed
/// on first use (FFmpeg does the same via `ff_thread_once`).
fn intra_quant() -> &'static [[i32; 64]; 16] {
    static QUANT: OnceLock<[[i32; 64]; 16]> = OnceLock::new();
    QUANT.get_or_init(calc_intra_quant)
}

fn inter_quant() -> &'static [[i32; 64]; 16] {
    static QUANT: OnceLock<[[i32; 64]; 16]> = OnceLock::new();
    QUANT.get_or_init(calc_inter_quant)
}

fn inv_bink_scan() -> [u8; 64] {
    let mut inv = [0u8; 64];
    for (i, &s) in BINK_SCAN.iter().enumerate() {
        inv[s as usize] = i as u8;
    }
    inv
}

fn calc_intra_quant() -> [[i32; 64]; 16] {
    calc_quant(&BINKB_INTRA_SEED)
}

fn calc_inter_quant() -> [[i32; 64]; 16] {
    calc_quant(&BINKB_INTER_SEED)
}

fn calc_quant(seed: &[u8; 64]) -> [[i32; 64]; 16] {
    let inv = inv_bink_scan();
    // FFmpeg: `C = 1LL << 30; ... / (den[j] * (C>>12))`. `C>>12 = 1<<18`.
    const SHIFT_DENOM: i64 = 1i64 << 18;
    let mut out = [[0i32; 64]; 16];
    for j in 0..16 {
        let num = BINKB_NUM[j] as i64;
        let den = BINKB_DEN[j] as i64;
        for i in 0..64 {
            let k = inv[i] as usize;
            let v = (seed[i] as i64) * (BINKB_S[i] as i64) * num / (den * SHIFT_DENOM);
            out[j][k] = v as i32;
        }
    }
    out
}

/// Per-frame state shared across the three planes.
pub struct DecoderState {
    /// Whether this is the very first frame ever decoded (`frame_num == 1`
    /// in FFmpeg). Adds `-15` to every Y motion offset on this one frame.
    pub is_first: bool,
}

/// Decode one BinkB plane in place.
///
/// The destination plane already holds a copy of the previous frame's
/// pixels — `SKIP` blocks rely on that. `width` / `height` are the plane
/// dimensions; `is_chroma` is currently unused (kept for symmetry with
/// the regular `decode_one_plane` API).
#[allow(clippy::too_many_arguments)]
pub fn decode_plane(
    r: &mut BitReader<'_>,
    plane: &mut Plane,
    bundles: &mut Bundles,
    state: &DecoderState,
    width: u32,
    height: u32,
    _is_chroma: bool,
) -> BikResult<()> {
    let bw = width.div_ceil(8);
    let bh = height.div_ceil(8);
    let stride = plane.stride;
    let ybias: i32 = if state.is_first { -15 } else { 0 };

    bundles.reset_cursors();

    for by in 0..bh {
        // Per-row: refill all 10 bundles.
        for kind_idx in 0..NB_SRC {
            let kind = match kind_idx {
                0 => BinkbSource::BlockTypes,
                1 => BinkbSource::Colors,
                2 => BinkbSource::Pattern,
                3 => BinkbSource::XOff,
                4 => BinkbSource::YOff,
                5 => BinkbSource::IntraDc,
                6 => BinkbSource::InterDc,
                7 => BinkbSource::IntraQ,
                8 => BinkbSource::InterQ,
                9 => BinkbSource::InterCoefs,
                _ => unreachable!(),
            };
            read_bundle(r, &mut bundles.b[kind_idx], kind)?;
        }

        for bx in 0..bw {
            let dst_off = (by as usize) * 8 * stride + (bx as usize) * 8;
            let blk = read_u8(&mut bundles.b[BinkbSource::BlockTypes as usize]);
            match blk {
                0 => {
                    // SKIP: leave the 8x8 region exactly as it is in the
                    // already-cloned previous frame. No bundle reads.
                }
                1 => {
                    decode_run_block(r, plane, dst_off, stride, bundles)?;
                }
                2 => {
                    decode_intra_block(r, plane, dst_off, stride, bundles)?;
                }
                3 => {
                    decode_residue_block(
                        r, plane, dst_off, stride, bundles, ybias, bx, by, bw, bh,
                    )?;
                }
                4 => {
                    decode_inter_block(r, plane, dst_off, stride, bundles, ybias, bx, by, bw, bh)?;
                }
                5 => {
                    let v = read_u8(&mut bundles.b[BinkbSource::Colors as usize]);
                    fill_block_8(plane, dst_off, stride, v);
                }
                6 => {
                    decode_pattern_block(plane, dst_off, stride, bundles);
                }
                7 => {
                    motion_compensate(plane, dst_off, stride, bundles, ybias, bx, by, bw, bh)?;
                }
                8 => {
                    decode_raw_block(plane, dst_off, stride, bundles);
                }
                _ => return Err(BikError::Malformed("invalid BinkB block type")),
            }
        }
    }

    // 32-bit alignment between planes.
    let pos = r.bit_pos();
    if pos & 31 != 0 {
        r.skip_bits(32 - (pos & 31));
    }
    Ok(())
}

/// `coordmap[k] = (k & 7) + (k >> 3) * stride` — maps a scan-order
/// `(col, row)` index inside a single 8×8 block to its absolute byte
/// offset within the plane. Computed once per call, kept on the stack.
fn build_coordmap(stride: usize) -> [usize; 64] {
    let mut map = [0usize; 64];
    for (i, slot) in map.iter_mut().enumerate() {
        *slot = (i & 7) + (i >> 3) * stride;
    }
    map
}

fn fill_block_8(plane: &mut Plane, dst_off: usize, stride: usize, v: u8) {
    for i in 0..8 {
        let row = dst_off + i * stride;
        plane.data[row..row + 8].fill(v);
    }
}

fn decode_pattern_block(plane: &mut Plane, dst_off: usize, stride: usize, bundles: &mut Bundles) {
    let c0 = read_u8(&mut bundles.b[BinkbSource::Colors as usize]);
    let c1 = read_u8(&mut bundles.b[BinkbSource::Colors as usize]);
    let cols = [c0, c1];
    for i in 0..8 {
        let mut v = read_u8(&mut bundles.b[BinkbSource::Pattern as usize]);
        let row = dst_off + i * stride;
        for j in 0..8 {
            plane.data[row + j] = cols[(v & 1) as usize];
            v >>= 1;
        }
    }
}

fn decode_raw_block(plane: &mut Plane, dst_off: usize, stride: usize, bundles: &mut Bundles) {
    // FFmpeg copies 64 contiguous bytes straight from the COLORS bundle's
    // current read position; we do the same to skip 64 individual reads.
    let b = &mut bundles.b[BinkbSource::Colors as usize];
    let src_ptr = b.cur_ptr;
    for i in 0..8 {
        let row = dst_off + i * stride;
        plane.data[row..row + 8].copy_from_slice(&b.data[src_ptr + i * 8..src_ptr + i * 8 + 8]);
    }
    b.cur_ptr += 64;
}

fn decode_run_block(
    r: &mut BitReader<'_>,
    plane: &mut Plane,
    dst_off: usize,
    stride: usize,
    bundles: &mut Bundles,
) -> BikResult<()> {
    let scan_idx = r.read_bits(4)? as usize;
    let scan = &BINK_PATTERNS[scan_idx];
    let coordmap = build_coordmap(stride);
    let mut sp = 0usize;
    let mut i = 0usize;
    while i < 63 {
        let mode_bit = r.read_bit()?;
        let run_bits = BINKB_RUNBITS[i] as u32;
        let run = (r.read_bits(run_bits)? as usize) + 1;
        i += run;
        if i > 64 {
            return Err(BikError::Malformed("BinkB RUN block overflow"));
        }
        if mode_bit != 0 {
            let v = read_u8(&mut bundles.b[BinkbSource::Colors as usize]);
            for _ in 0..run {
                let pos = scan[sp] as usize;
                plane.data[dst_off + coordmap[pos]] = v;
                sp += 1;
            }
        } else {
            for _ in 0..run {
                let v = read_u8(&mut bundles.b[BinkbSource::Colors as usize]);
                let pos = scan[sp] as usize;
                plane.data[dst_off + coordmap[pos]] = v;
                sp += 1;
            }
        }
    }
    if i == 63 {
        let v = read_u8(&mut bundles.b[BinkbSource::Colors as usize]);
        let pos = scan[sp] as usize;
        plane.data[dst_off + coordmap[pos]] = v;
    }
    Ok(())
}

fn decode_intra_block(
    r: &mut BitReader<'_>,
    plane: &mut Plane,
    dst_off: usize,
    stride: usize,
    bundles: &mut Bundles,
) -> BikResult<()> {
    let mut block = [0i32; 64];
    block[0] = read_i16(&mut bundles.b[BinkbSource::IntraDc as usize]) as i32;
    let qp = read_u8(&mut bundles.b[BinkbSource::IntraQ as usize]) as i32;
    let mut coef_idx = [0u8; 64];
    let mut count = 0usize;
    let q = read_dct_coeffs(r, &mut block, &BINK_SCAN, &mut coef_idx, &mut count, qp)?;
    unquantize_dct_coeffs(
        &mut block,
        &intra_quant()[q as usize],
        &coef_idx[..count],
        &BINK_SCAN,
    );
    idct_put(
        &mut plane.data[dst_off..dst_off + 7 * stride + 8],
        stride,
        &block,
    );
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn decode_inter_block(
    r: &mut BitReader<'_>,
    plane: &mut Plane,
    dst_off: usize,
    stride: usize,
    bundles: &mut Bundles,
    ybias: i32,
    bx: u32,
    by: u32,
    bw: u32,
    bh: u32,
) -> BikResult<()> {
    motion_compensate(plane, dst_off, stride, bundles, ybias, bx, by, bw, bh)?;
    let mut block = [0i32; 64];
    block[0] = read_i16(&mut bundles.b[BinkbSource::InterDc as usize]) as i32;
    let qp = read_u8(&mut bundles.b[BinkbSource::InterQ as usize]) as i32;
    let mut coef_idx = [0u8; 64];
    let mut count = 0usize;
    let q = read_dct_coeffs(r, &mut block, &BINK_SCAN, &mut coef_idx, &mut count, qp)?;
    unquantize_dct_coeffs(
        &mut block,
        &inter_quant()[q as usize],
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

#[allow(clippy::too_many_arguments)]
fn decode_residue_block(
    r: &mut BitReader<'_>,
    plane: &mut Plane,
    dst_off: usize,
    stride: usize,
    bundles: &mut Bundles,
    ybias: i32,
    bx: u32,
    by: u32,
    bw: u32,
    bh: u32,
) -> BikResult<()> {
    motion_compensate(plane, dst_off, stride, bundles, ybias, bx, by, bw, bh)?;
    let mut block = [0i16; 64];
    let masks = read_u8(&mut bundles.b[BinkbSource::InterCoefs as usize]) as i32;
    crate::dct::read_residue(r, &mut block, masks)?;
    add_pixels8(
        &mut plane.data[dst_off..dst_off + 7 * stride + 8],
        &block,
        stride,
    );
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn motion_compensate(
    plane: &mut Plane,
    dst_off: usize,
    stride: usize,
    bundles: &mut Bundles,
    ybias: i32,
    bx: u32,
    by: u32,
    bw: u32,
    bh: u32,
) -> BikResult<()> {
    let xoff = read_i8(&mut bundles.b[BinkbSource::XOff as usize]) as i32;
    let yoff = read_i8(&mut bundles.b[BinkbSource::YOff as usize]) as i32 + ybias;
    let src_x = bx as i32 * 8 + xoff;
    let src_y = by as i32 * 8 + yoff;
    // FFmpeg's bounds check uses pointer arithmetic on the START of the
    // reference block: `ref_start = plane_data` and `ref_end =
    // plane_data + ((bh-1)*stride + bw-1) * 8`. Out-of-bounds refs are
    // logged but the copy is silently skipped — the destination keeps
    // whatever pixels it already had. RESIDUE / INTER blocks still
    // proceed to add their residue / DCT coeffs on top.
    let ref_off = src_y as i64 * stride as i64 + src_x as i64;
    let ref_start: i64 = 0;
    let ref_end: i64 = ((bh - 1) as i64 * stride as i64 + bw as i64 - 1) * 8;
    if ref_off < ref_start || ref_off > ref_end {
        // Mirrors FFmpeg's `av_log(... AV_LOG_WARNING ...)` path: no copy,
        // dst untouched, no error.
        return Ok(());
    }
    let src_off = ref_off as usize;
    // Source and destination may overlap (reading from the same frame); copy
    // into a 64-byte temp first to be safe.
    let mut tmp = [0u8; 64];
    for i in 0..8 {
        tmp[i * 8..i * 8 + 8]
            .copy_from_slice(&plane.data[src_off + i * stride..src_off + i * stride + 8]);
    }
    for i in 0..8 {
        plane.data[dst_off + i * stride..dst_off + i * stride + 8]
            .copy_from_slice(&tmp[i * 8..i * 8 + 8]);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn intra_quant_first_table_first_entry_is_seed_dot_s() {
        // intra_quant[0][inv_scan[0]] = intra_seed[0] * s[0] * num[0]
        //                                / (den[0] * (1<<18))
        // For row 0, j=0: num=1, den=1, seed[0]=16, s[0]=1073741824.
        // Result = 16 * 1073741824 / (1 * 262144) = 65536.
        let q = intra_quant();
        let inv = inv_bink_scan();
        assert_eq!(q[0][inv[0] as usize], 65536);
    }

    #[test]
    fn inter_quant_uses_inter_seed() {
        // inter_seed[0] = 16, num[0]=1, den[0]=1 → same answer as intra
        // when seeds happen to align (they do at index 0: both are 16).
        let q = inter_quant();
        let inv = inv_bink_scan();
        assert_eq!(q[0][inv[0] as usize], 65536);
    }

    #[test]
    fn inv_bink_scan_is_a_permutation() {
        let inv = inv_bink_scan();
        let mut seen = [false; 64];
        for &v in &inv {
            assert!(!seen[v as usize], "duplicate index {v}");
            seen[v as usize] = true;
        }
    }
}
